// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// src/pos/fiscal/settings.service.ts
//
// Per-store ПРРО settings: read, validate, upsert. Owns the only path by which
// a provider credential enters or leaves the database.

import { pool } from '../../db.js';
import {
  decryptSecrets,
  encryptSecrets,
  isSecretsKeyConfigured,
  SECRETS_KEY_VERSION,
} from '../core/secrets.js';
import { getProvider, hasProvider } from './providers/index.js';
import { isReservedRegisterKey, secretsScope, shiftKeyMatchesSql } from './registers.js';
import { invalidateStore } from './runtime.js';
import {
  type FiscalRequisites,
  FISCAL_RECEIPT_WIDTHS,
  OFFLINE_CODES_TARGET_DEFAULT,
  OFFLINE_CODES_TARGET_MAX,
  OFFLINE_CODES_TARGET_MIN,
  isFiscalProviderId,
  type FiscalCredentials,
  type FiscalProviderId,
  type FiscalReceiptWidth,
  type FiscalRegisterSummary,
  type FiscalSettingsPatch,
  type FiscalSettingsView,
  type PosFiscalSettings,
} from './types.js';

/** Caller supplied something we won't store. Routes map this to 400. */
export class FiscalSettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FiscalSettingsValidationError';
  }
}

const TAX_CODE_RE = /^[A-Za-z0-9_-]{1,16}$/;
const SECRET_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,40}$/;
const MAX_SECRET_KEYS = 16;
const MAX_SECRET_VALUE_LEN = 4096;
const MAX_CONFIG_BYTES = 8192;

function mapRow(row: Record<string, unknown>): PosFiscalSettings {
  return {
    store_id: Number(row.store_id),
    register_no: 1,
    label: null,
    enabled: Boolean(row.enabled),
    provider: isFiscalProviderId(row.provider) ? row.provider : null,
    config: (row.config as Record<string, unknown> | null) ?? {},
    secrets_encrypted: (row.secrets_encrypted as Buffer | null) ?? null,
    secrets_key_version:
      row.secrets_key_version == null ? null : Number(row.secrets_key_version),
    default_tax_code: (row.default_tax_code as string | null) ?? null,
    auto_open_shift: Boolean(row.auto_open_shift),
    fail_mode: 'block',
    receipt_source: row.receipt_source === 'provider' ? 'provider' : 'local',
    receipt_width: Number(row.receipt_width) === 48 ? 48 : 32,
    offline_mode: Boolean(row.offline_mode),
    register_fiscal_number: (row.register_fiscal_number as string | null) ?? null,
    requisites: (row.requisites as FiscalRequisites | null) ?? null,
    requisites_fetched_at: (row.requisites_fetched_at as Date | null) ?? null,
    offline_codes_target: Number(row.offline_codes_target) || OFFLINE_CODES_TARGET_DEFAULT,
    holder_device_id: (row.holder_device_id as string | null) ?? null,
    holder_name: (row.holder_name as string | null) ?? null,
    holder_since: (row.holder_since as Date | null) ?? null,
    holder_last_seen_at: (row.holder_last_seen_at as Date | null) ?? null,
    handover_device_id: (row.handover_device_id as string | null) ?? null,
    handover_name: (row.handover_name as string | null) ?? null,
    handover_requested_at: (row.handover_requested_at as Date | null) ?? null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/**
 * Cache the register's own fiscal number (ФН ПРРО) as the provider reports it.
 *
 * Written from wherever we already hold a `registerState()` answer — never by
 * asking for one on the checkout path. It only ever changes when the store is
 * re-pointed at another register, and offline it cannot be asked for at all,
 * which is exactly when the tax-office link needs it (`taxUrl.ts`).
 */
export async function rememberRegisterFiscalNumber(
  storeId: number,
  fiscalNumber: string | null | undefined,
  registerNo = 1
): Promise<void> {
  const value = fiscalNumber?.trim();
  if (!value) return;
  await pool.query(
    registerNo >= 2
      ? `UPDATE pos_fiscal_registers
         SET register_fiscal_number = $2, updated_at = NOW()
         WHERE store_id = $1 AND register_no = $3 AND register_fiscal_number IS DISTINCT FROM $2`
      : `UPDATE pos_fiscal_settings
         SET register_fiscal_number = $2, updated_at = NOW()
         WHERE store_id = $1 AND register_fiscal_number IS DISTINCT FROM $2`,
    registerNo >= 2 ? [storeId, value.slice(0, 64), registerNo] : [storeId, value.slice(0, 64)]
  );
}

/**
 * Cache the provider's view of the store (see `FiscalRequisites`), whole.
 *
 * Replaced, never merged: it is one snapshot from one provider call, and a
 * field the provider stopped reporting should disappear rather than linger.
 * The register's own number is mirrored into its dedicated column too — the
 * tax-office link builder reads it from there.
 */
export async function rememberRequisites(
  storeId: number,
  requisites: FiscalRequisites,
  registerNo = 1
): Promise<void> {
  await pool.query(
    registerNo >= 2
      ? `UPDATE pos_fiscal_registers
         SET requisites = $2::jsonb, requisites_fetched_at = NOW(), updated_at = NOW()
         WHERE store_id = $1 AND register_no = $3`
      : `UPDATE pos_fiscal_settings
         SET requisites = $2::jsonb, requisites_fetched_at = NOW(), updated_at = NOW()
         WHERE store_id = $1`,
    registerNo >= 2
      ? [storeId, JSON.stringify(requisites), registerNo]
      : [storeId, JSON.stringify(requisites)]
  );
  await rememberRegisterFiscalNumber(storeId, requisites.register.fiscal_number, registerNo);
}

/**
 * Whether a shift of this register is live. Its own query rather than
 * `getLiveShiftRow`: `shifts.service.ts` imports this file, so importing it
 * back would be a cycle, and the hook needs only "is there one".
 */
async function hasLiveShift(storeId: number, registerNo = 1): Promise<boolean> {
  const live = await pool.query(
    `SELECT 1 FROM pos_fiscal_shifts
     WHERE store_id = $1 AND status IN ('opening', 'open', 'closing')
       AND ${shiftKeyMatchesSql('cash_register_key', '$2')}
     LIMIT 1`,
    [storeId, registerNo]
  );
  return live.rows.length > 0;
}

/**
 * Documents the retry cron still owes the provider: the same rows
 * `retryPendingFiscalDocs` would claim — not yet delivered and not parked
 * for a human (a parked row has no `next_attempt_at`).
 */
async function countPendingDocuments(storeId: number, registerNo = 1): Promise<number> {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS n FROM pos_fiscal_receipts
     WHERE store_id = $1 AND register_no = $2 AND status IN ('pending', 'sent', 'failed')
       AND (status <> 'failed' OR next_attempt_at IS NOT NULL)`,
    [storeId, registerNo]
  );
  return Number(result.rows[0]?.n ?? 0);
}

/**
 * A register 2.. row in register 1's shape. What it does not have, it does not
 * do: no offline mode, no holder, our own receipt layout. The paper width is
 * the store's — both registers print on the same till printers.
 */
function mapRegisterRow(row: Record<string, unknown>): PosFiscalSettings {
  return {
    store_id: Number(row.store_id),
    register_no: Number(row.register_no),
    label: (row.label as string | null) ?? null,
    enabled: Boolean(row.enabled),
    provider: isFiscalProviderId(row.provider) ? row.provider : null,
    config: (row.config as Record<string, unknown> | null) ?? {},
    secrets_encrypted: (row.secrets_encrypted as Buffer | null) ?? null,
    secrets_key_version:
      row.secrets_key_version == null ? null : Number(row.secrets_key_version),
    default_tax_code: (row.default_tax_code as string | null) ?? null,
    auto_open_shift: Boolean(row.auto_open_shift),
    fail_mode: 'block',
    receipt_source: 'local',
    receipt_width: Number(row.store_receipt_width) === 48 ? 48 : 32,
    offline_mode: false,
    register_fiscal_number: (row.register_fiscal_number as string | null) ?? null,
    requisites: (row.requisites as FiscalRequisites | null) ?? null,
    requisites_fetched_at: (row.requisites_fetched_at as Date | null) ?? null,
    offline_codes_target: OFFLINE_CODES_TARGET_DEFAULT,
    holder_device_id: null,
    holder_name: null,
    holder_since: null,
    holder_last_seen_at: null,
    handover_device_id: null,
    handover_name: null,
    handover_requested_at: null,
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/**
 * The register's row, or null when it was never configured. Register 1 is
 * `pos_fiscal_settings`, as it always was; 2.. are `pos_fiscal_registers`.
 */
export async function getFiscalSettings(
  storeId: number,
  registerNo = 1
): Promise<PosFiscalSettings | null> {
  if (registerNo >= 2) {
    const result = await pool.query(
      `SELECT r.*, fs.receipt_width AS store_receipt_width
       FROM pos_fiscal_registers r
       LEFT JOIN pos_fiscal_settings fs ON fs.store_id = r.store_id
       WHERE r.store_id = $1 AND r.register_no = $2`,
      [storeId, registerNo]
    );
    return result.rows.length > 0 ? mapRegisterRow(result.rows[0]) : null;
  }
  const result = await pool.query(`SELECT * FROM pos_fiscal_settings WHERE store_id = $1`, [
    storeId,
  ]);
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
}

/** The store's registers 2.., for register 1's view and its guards. */
export async function listExtraRegisters(storeId: number): Promise<PosFiscalSettings[]> {
  const result = await pool.query(
    `SELECT r.*, fs.receipt_width AS store_receipt_width
     FROM pos_fiscal_registers r
     LEFT JOIN pos_fiscal_settings fs ON fs.store_id = r.store_id
     WHERE r.store_id = $1
     ORDER BY r.register_no`,
    [storeId]
  );
  return result.rows.map(mapRegisterRow);
}

function decryptFor(settings: PosFiscalSettings): Record<string, string> {
  if (!settings.secrets_encrypted || !settings.provider) return {};
  return decryptSecrets(
    settings.store_id,
    secretsScope(settings.provider, settings.register_no),
    settings.secrets_encrypted
  );
}

/**
 * Decrypt the stored credential bag, or read it as empty.
 *
 * Returns null when fiscalisation is off or no provider is chosen — callers
 * treat that as "this store does not fiscalise", not as an error. A stored
 * envelope that fails to decrypt DOES throw: silently falling back to empty
 * credentials would turn a key-rotation mistake into "provider rejected our
 * empty licence", which is a much harder support call.
 */
export async function getFiscalCredentials(
  storeId: number,
  opts: { requireEnabled?: boolean; registerNo?: number } = {}
): Promise<FiscalCredentials | null> {
  const requireEnabled = opts.requireEnabled ?? true;
  const settings = await getFiscalSettings(storeId, opts.registerNo ?? 1);
  if (!settings || (requireEnabled && !settings.enabled) || !settings.provider) return null;

  return { provider: settings.provider, config: settings.config, secrets: decryptFor(settings) };
}

/** Whether the adapter compiled in for `provider` declares the offline capability. */
export function isOfflineCapable(provider: string | null | undefined): boolean {
  if (!provider || !isFiscalProviderId(provider) || !hasProvider(provider)) return false;
  return Boolean(getProvider(provider).offline);
}

/** Secret-free projection for the wire. */
export function toFiscalSettingsView(
  storeId: number,
  settings: PosFiscalSettings | null,
  extra?: PosFiscalSettings[]
): FiscalSettingsView {
  const extraRegisters = extra?.map(registerSummary);
  if (!settings) {
    return {
      enabled: false,
      provider: null,
      config: {},
      secrets_set: [],
      default_tax_code: null,
      auto_open_shift: true,
      fail_mode: 'block',
      receipt_source: 'local',
      receipt_width: 32,
      offline_mode: false,
      offline_codes_target: OFFLINE_CODES_TARGET_DEFAULT,
      offline_capable: false,
      receipt_text_capable: false,
      requisites: null,
      requisites_fetched_at: null,
      updated_at: null,
      ...(extraRegisters ? { extra_registers: extraRegisters } : {}),
    };
  }

  // A row whose envelope no longer decrypts (rotated key, restored backup)
  // reports no credentials rather than failing the whole settings screen — the
  // owner needs that screen precisely to re-enter them.
  let secretsSet: string[] = [];
  try {
    secretsSet = Object.keys(decryptFor({ ...settings, store_id: storeId })).sort();
  } catch {
    secretsSet = [];
  }

  return {
    enabled: settings.enabled,
    provider: settings.provider,
    config: settings.config,
    secrets_set: secretsSet,
    default_tax_code: settings.default_tax_code,
    auto_open_shift: settings.auto_open_shift,
    fail_mode: settings.fail_mode,
    receipt_source: settings.receipt_source,
    receipt_width: settings.receipt_width,
    offline_mode: settings.offline_mode,
    offline_codes_target: settings.offline_codes_target,
    requisites: settings.requisites,
    requisites_fetched_at: settings.requisites_fetched_at
      ? new Date(settings.requisites_fetched_at).toISOString()
      : null,
    offline_capable: isOfflineCapable(settings.provider),
    receipt_text_capable:
      settings.register_no === 1 && isReceiptTextCapable(settings.provider),
    updated_at: settings.updated_at ? new Date(settings.updated_at).toISOString() : null,
    register_no: settings.register_no,
    ...(settings.register_no >= 2 ? { label: settings.label } : {}),
    ...(extraRegisters ? { extra_registers: extraRegisters } : {}),
  };
}

function registerSummary(settings: PosFiscalSettings): FiscalRegisterSummary {
  let configured = false;
  try {
    configured = Object.keys(decryptFor(settings)).length > 0;
  } catch {
    configured = false;
  }
  return {
    register_no: settings.register_no,
    label: settings.label,
    enabled: settings.enabled,
    provider: settings.provider ?? 'cashalot',
    configured,
  };
}

function isReceiptTextCapable(provider: FiscalProviderId | null): boolean {
  if (!provider || !hasProvider(provider)) return false;
  return typeof getProvider(provider).renderReceipt === 'function';
}

function validateConfig(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FiscalSettingsValidationError('config must be an object');
  }
  const serialized = JSON.stringify(input);
  if (serialized.length > MAX_CONFIG_BYTES) {
    throw new FiscalSettingsValidationError(
      `config must be at most ${MAX_CONFIG_BYTES} bytes`
    );
  }
  return input as Record<string, unknown>;
}

function validateSecretsPatch(input: unknown): Record<string, string | null> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new FiscalSettingsValidationError('secrets must be an object');
  }
  const entries = Object.entries(input as Record<string, unknown>);
  if (entries.length > MAX_SECRET_KEYS) {
    throw new FiscalSettingsValidationError(`secrets must have at most ${MAX_SECRET_KEYS} keys`);
  }
  const out: Record<string, string | null> = {};
  for (const [key, value] of entries) {
    if (!SECRET_KEY_RE.test(key)) {
      throw new FiscalSettingsValidationError(`secrets key "${key}" is not a valid identifier`);
    }
    if (value === null) {
      out[key] = null;
      continue;
    }
    if (typeof value !== 'string') {
      throw new FiscalSettingsValidationError(`secrets.${key} must be a string or null`);
    }
    if (value.length > MAX_SECRET_VALUE_LEN) {
      throw new FiscalSettingsValidationError(
        `secrets.${key} must be at most ${MAX_SECRET_VALUE_LEN} characters`
      );
    }
    out[key] = value;
  }
  return out;
}

/**
 * Merge a secrets patch onto what is stored.
 *
 * Empty string means "leave it alone" — the settings form round-trips blank
 * password inputs, and treating that as "clear it" would wipe a working licence
 * key every time the owner edited an unrelated field. `null` is the explicit
 * clear.
 */
function mergeSecrets(
  current: Record<string, string>,
  patch: Record<string, string | null>
): Record<string, string> {
  const merged = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
    else if (value !== '') merged[key] = value;
  }
  return merged;
}

/**
 * Apply a patch and return the saved row.
 *
 * Switching provider drops the stored credentials: a Checkbox licence key is
 * meaningless to Вчасно, and the AAD binds the envelope to the provider it was
 * written for, so carrying it across would not decrypt anyway.
 */
export async function updateFiscalSettings(
  storeId: number,
  patch: FiscalSettingsPatch
): Promise<PosFiscalSettings> {
  const existing = await getFiscalSettings(storeId);

  const provider =
    patch.provider === undefined ? (existing?.provider ?? null) : patch.provider;
  if (provider !== null && !isFiscalProviderId(provider)) {
    throw new FiscalSettingsValidationError(`Unknown fiscal provider "${provider}"`);
  }

  const enabled = patch.enabled ?? existing?.enabled ?? false;
  if (enabled && !provider) {
    throw new FiscalSettingsValidationError('A provider must be selected before enabling');
  }

  let config = patch.config === undefined ? (existing?.config ?? {}) : validateConfig(patch.config);

  const defaultTaxCode = parseDefaultTaxCode(patch.default_tax_code, existing);

  const autoOpenShift = patch.auto_open_shift ?? existing?.auto_open_shift ?? true;

  let receiptSource = existing?.receipt_source ?? 'local';
  if (patch.receipt_source !== undefined) {
    if (patch.receipt_source !== 'local' && patch.receipt_source !== 'provider') {
      throw new FiscalSettingsValidationError("receipt_source must be 'local' or 'provider'");
    }
    receiptSource = patch.receipt_source;
  }

  let receiptWidth: FiscalReceiptWidth = existing?.receipt_width ?? 32;
  if (patch.receipt_width !== undefined) {
    if (!FISCAL_RECEIPT_WIDTHS.includes(patch.receipt_width)) {
      throw new FiscalSettingsValidationError(
        `receipt_width must be one of ${FISCAL_RECEIPT_WIDTHS.join(', ')}`
      );
    }
    receiptWidth = patch.receipt_width;
  }

  const providerChanged = Boolean(existing?.provider) && existing?.provider !== provider;

  // Offline mode is a promise the adapter has to be able to keep: a provider
  // without the capability cannot hand out offline codes, so the switch is
  // refused rather than stored as a dormant "true". A provider switch drops it
  // for the same reason the credentials are dropped.
  let offlineMode = providerChanged ? false : (existing?.offline_mode ?? false);
  if (patch.offline_mode !== undefined) {
    if (typeof patch.offline_mode !== 'boolean') {
      throw new FiscalSettingsValidationError('offline_mode must be a boolean');
    }
    offlineMode = patch.offline_mode;
  }
  if (offlineMode && !isOfflineCapable(provider)) {
    if (patch.offline_mode) {
      throw new FiscalSettingsValidationError('Провайдер не підтримує офлайн-режим');
    }
    offlineMode = false;
  }
  if (offlineMode && !enabled) {
    throw new FiscalSettingsValidationError('Увімкніть фіскалізацію перед офлайн-режимом');
  }
  if (existing?.offline_mode && !offlineMode) {
    const live = await pool.query(
      `SELECT 1 FROM pos_fiscal_offline_sessions
       WHERE store_id = $1 AND status IN ('open', 'replaying') LIMIT 1`,
      [storeId]
    );
    if (live.rows.length > 0) {
      throw new FiscalSettingsValidationError(
        'Триває офлайн-сесія — дочекайтесь її завершення перед вимкненням офлайн-режиму'
      );
    }
  }

  if (patch.config !== undefined && isReservedRegisterKey(config.cashRegisterKey)) {
    throw new FiscalSettingsValidationError(
      'Ключ каси виду «r2» зарезервовано за другою касою магазину'
    );
  }

  // A store with a second register keeps register 1 on Cashalot, online and
  // on (decision Д5): its documents, shifts and refunds are routed by register,
  // and Checkbox's offline mode would hand register 1 a holder and an offline
  // session that know nothing of register 2.
  const extraOn = (await listExtraRegisters(storeId)).some((r) => r.enabled);
  if (extraOn) {
    if (provider !== 'cashalot') {
      throw new FiscalSettingsValidationError(
        'У магазині працює друга каса — основна каса має лишатися на Cashalot. Спершу вимкніть другу касу'
      );
    }
    if (!enabled) {
      throw new FiscalSettingsValidationError(
        'У магазині працює друга каса — спершу вимкніть її, потім основну'
      );
    }
    if (offlineMode) {
      throw new FiscalSettingsValidationError(
        'Офлайн-режим недоступний, поки в магазині працює друга каса'
      );
    }
  }

  if (patch.config !== undefined && provider) {
    config = await applyProviderConfigRules(
      provider,
      config,
      providerChanged ? null : (existing?.config ?? null),
      storeId,
      1
    );
  }

  const configChanged =
    patch.config !== undefined && JSON.stringify(config) !== JSON.stringify(existing?.config ?? {});

  let offlineCodesTarget = existing?.offline_codes_target ?? OFFLINE_CODES_TARGET_DEFAULT;
  if (patch.offline_codes_target !== undefined) {
    const raw = patch.offline_codes_target;
    if (
      !Number.isInteger(raw) ||
      raw < OFFLINE_CODES_TARGET_MIN ||
      raw > OFFLINE_CODES_TARGET_MAX
    ) {
      throw new FiscalSettingsValidationError(
        `offline_codes_target must be an integer between ${OFFLINE_CODES_TARGET_MIN} and ${OFFLINE_CODES_TARGET_MAX}`
      );
    }
    offlineCodesTarget = raw;
  }

  const secretsPatch = patch.secrets === undefined ? null : validateSecretsPatch(patch.secrets);

  let secretsEncrypted = providerChanged ? null : (existing?.secrets_encrypted ?? null);
  let secretsKeyVersion = providerChanged ? null : (existing?.secrets_key_version ?? null);

  if (secretsPatch && provider) {
    if (!isSecretsKeyConfigured()) {
      // Surfaced as 503 by the route: refusing is the only safe answer, since
      // the alternative is writing a licence key to the database in plaintext.
      throw new Error('POS_SECRETS_KEY is not configured');
    }
    const current =
      !providerChanged && existing?.secrets_encrypted && existing.provider
        ? decryptSecrets(storeId, existing.provider, existing.secrets_encrypted)
        : {};
    const merged = mergeSecrets(current, secretsPatch);
    if (Object.keys(merged).length === 0) {
      secretsEncrypted = null;
      secretsKeyVersion = null;
    } else {
      secretsEncrypted = encryptSecrets(storeId, provider, merged);
      secretsKeyVersion = SECRETS_KEY_VERSION;
    }
  } else if (secretsPatch && !provider) {
    throw new FiscalSettingsValidationError('A provider must be selected before saving credentials');
  }

  const result = await pool.query(
    `INSERT INTO pos_fiscal_settings
       (store_id, enabled, provider, config, secrets_encrypted, secrets_key_version,
        default_tax_code, auto_open_shift, receipt_source, receipt_width,
        offline_mode, offline_codes_target)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (store_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       provider = EXCLUDED.provider,
       config = EXCLUDED.config,
       secrets_encrypted = EXCLUDED.secrets_encrypted,
       secrets_key_version = EXCLUDED.secrets_key_version,
       default_tax_code = EXCLUDED.default_tax_code,
       auto_open_shift = EXCLUDED.auto_open_shift,
       receipt_source = EXCLUDED.receipt_source,
       receipt_width = EXCLUDED.receipt_width,
       offline_mode = EXCLUDED.offline_mode,
       offline_codes_target = EXCLUDED.offline_codes_target,
       requisites_fetched_at = CASE WHEN $13::boolean THEN NULL
                                    ELSE pos_fiscal_settings.requisites_fetched_at END,
       updated_at = NOW()
     RETURNING *`,
    [
      storeId,
      enabled,
      provider,
      JSON.stringify(config),
      secretsEncrypted,
      secretsKeyVersion,
      defaultTaxCode,
      autoOpenShift,
      receiptSource,
      receiptWidth,
      offlineMode,
      offlineCodesTarget,
      // The cached requisites may be built FROM the config (Cashalot's tax
      // table is what `fetchRequisites` answers with), and the till prints
      // from that cache for up to a day. A changed config ages it out, so the
      // next shift open — or the owner's connection test — reads it afresh.
      configChanged,
    ]
  );

  // A cached session belongs to the provider and credentials it was minted
  // for. Reusing one after the owner switched providers would send a Checkbox
  // token to Вчасно, so any settings write drops the whole runtime entry.
  invalidateStore(storeId);

  return mapRow(result.rows[0]);
}

function parseDefaultTaxCode(
  raw: string | null | undefined,
  existing: PosFiscalSettings | null
): string | null {
  if (raw === undefined) return existing?.default_tax_code ?? null;
  if (raw === null || raw === '') return null;
  if (typeof raw !== 'string' || !TAX_CODE_RE.test(raw.trim())) {
    throw new FiscalSettingsValidationError(
      'Код ставки — від 1 до 16 латинських літер, цифр, «_» або «-»'
    );
  }
  return raw.trim();
}

/**
 * The provider's own rules for its `config` (contract v2, phase CA4) — e.g.
 * Cashalot's tax table, which must not change inside an open shift. Only for a
 * provider this build has an adapter for: an id without one (`vchasno`) is
 * stored exactly as before. The shift and the queue asked about are THIS
 * register's — register 2's open shift says nothing about register 1's table.
 */
async function applyProviderConfigRules(
  provider: FiscalProviderId,
  config: Record<string, unknown>,
  previous: Record<string, unknown> | null,
  storeId: number,
  registerNo: number
): Promise<Record<string, unknown>> {
  if (!hasProvider(provider)) return config;
  const adapter = getProvider(provider);
  if (!adapter.normalizeConfig) return config;
  const [shiftOpen, pendingDocuments] = await Promise.all([
    hasLiveShift(storeId, registerNo),
    countPendingDocuments(storeId, registerNo),
  ]);
  let next: Record<string, unknown>;
  try {
    next = adapter.normalizeConfig(config, { previous, shiftOpen, pendingDocuments });
  } catch (error) {
    throw new FiscalSettingsValidationError(
      error instanceof Error ? error.message : String(error)
    );
  }
  // The hook may have grown it; the column's own limits still hold.
  return validateConfig(next);
}

const LABEL_MAX = 60;

/**
 * Apply a patch to register 2.. and return the saved row (track ДК,
 * POS_DUAL_REGISTER.md §4.1). The first write creates the row.
 *
 * Always Cashalot (Д5), always online. It may be switched on only beside a
 * register 1 that is on, on Cashalot and not in offline mode — the same rule
 * `updateFiscalSettings` keeps from the other side — and switched off only
 * once it has no live shift and owes the provider nothing, or those documents
 * would be left with no register to retry or return through.
 */
export async function updateRegisterSettings(
  storeId: number,
  registerNo: number,
  patch: FiscalSettingsPatch
): Promise<PosFiscalSettings> {
  if (!Number.isInteger(registerNo) || registerNo < 2) {
    throw new FiscalSettingsValidationError('register must be 2 or more');
  }
  if (patch.provider !== undefined && patch.provider !== 'cashalot') {
    throw new FiscalSettingsValidationError('Друга каса працює лише з Cashalot');
  }
  if (
    patch.offline_mode === true ||
    patch.receipt_source === 'provider' ||
    patch.offline_codes_target !== undefined ||
    patch.receipt_width !== undefined
  ) {
    throw new FiscalSettingsValidationError(
      'Для другої каси немає офлайн-режиму, чека провайдера й власної ширини паперу'
    );
  }

  const existing = await getFiscalSettings(storeId, registerNo);
  const provider: FiscalProviderId = 'cashalot';

  const enabled = patch.enabled ?? existing?.enabled ?? false;
  if (enabled && !existing?.enabled) {
    const main = await getFiscalSettings(storeId, 1);
    if (!main?.enabled || main.provider !== 'cashalot') {
      throw new FiscalSettingsValidationError(
        'Друга каса вмикається лише разом з основною касою на Cashalot — спершу налаштуйте основну'
      );
    }
    if (main.offline_mode) {
      throw new FiscalSettingsValidationError(
        'Друга каса недоступна, поки основна працює в офлайн-режимі — вимкніть його'
      );
    }
  }
  if (!enabled && existing?.enabled) {
    if (await hasLiveShift(storeId, registerNo)) {
      throw new FiscalSettingsValidationError(
        'У другої каси відкрита зміна — закрийте її перед вимкненням'
      );
    }
    if ((await countPendingDocuments(storeId, registerNo)) > 0) {
      throw new FiscalSettingsValidationError(
        'Друга каса ще реєструє документи — дочекайтесь їх перед вимкненням'
      );
    }
  }

  let label = existing?.label ?? null;
  if (patch.label !== undefined) {
    if (patch.label !== null && typeof patch.label !== 'string') {
      throw new FiscalSettingsValidationError('label must be a string or null');
    }
    const trimmed = patch.label?.trim() ?? '';
    if (trimmed.length > LABEL_MAX) {
      throw new FiscalSettingsValidationError(`Назва каси — до ${LABEL_MAX} символів`);
    }
    label = trimmed || null;
  }

  let config =
    patch.config === undefined ? (existing?.config ?? {}) : validateConfig(patch.config);
  if (patch.config !== undefined) {
    // Register 2's key is `r<N>` by construction; a key of its own in the
    // config would only be misread by somebody later.
    delete config.cashRegisterKey;
    config = await applyProviderConfigRules(
      provider,
      config,
      existing?.config ?? null,
      storeId,
      registerNo
    );
  }
  const configChanged =
    patch.config !== undefined && JSON.stringify(config) !== JSON.stringify(existing?.config ?? {});

  const defaultTaxCode = parseDefaultTaxCode(patch.default_tax_code, existing);
  const autoOpenShift = patch.auto_open_shift ?? existing?.auto_open_shift ?? true;

  let secretsEncrypted = existing?.secrets_encrypted ?? null;
  let secretsKeyVersion = existing?.secrets_key_version ?? null;
  if (patch.secrets !== undefined) {
    const secretsPatch = validateSecretsPatch(patch.secrets);
    if (!isSecretsKeyConfigured()) throw new Error('POS_SECRETS_KEY is not configured');
    const scope = secretsScope(provider, registerNo);
    const merged = mergeSecrets(existing ? decryptFor(existing) : {}, secretsPatch);
    if (Object.keys(merged).length === 0) {
      secretsEncrypted = null;
      secretsKeyVersion = null;
    } else {
      secretsEncrypted = encryptSecrets(storeId, scope, merged);
      secretsKeyVersion = SECRETS_KEY_VERSION;
    }
  }

  await pool.query(
    `INSERT INTO pos_fiscal_registers
       (store_id, register_no, label, enabled, provider, config, secrets_encrypted,
        secrets_key_version, default_tax_code, auto_open_shift)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10)
     ON CONFLICT (store_id, register_no) DO UPDATE SET
       label = EXCLUDED.label,
       enabled = EXCLUDED.enabled,
       config = EXCLUDED.config,
       secrets_encrypted = EXCLUDED.secrets_encrypted,
       secrets_key_version = EXCLUDED.secrets_key_version,
       default_tax_code = EXCLUDED.default_tax_code,
       auto_open_shift = EXCLUDED.auto_open_shift,
       requisites_fetched_at = CASE WHEN $11::boolean THEN NULL
                                    ELSE pos_fiscal_registers.requisites_fetched_at END,
       updated_at = NOW()`,
    [
      storeId,
      registerNo,
      label,
      enabled,
      provider,
      JSON.stringify(config),
      secretsEncrypted,
      secretsKeyVersion,
      defaultTaxCode,
      autoOpenShift,
      configChanged,
    ]
  );

  invalidateStore(storeId);
  return (await getFiscalSettings(storeId, registerNo)) as PosFiscalSettings;
}
