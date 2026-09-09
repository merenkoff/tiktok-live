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
import { invalidateStore } from './runtime.js';
import {
  isFiscalProviderId,
  type FiscalCredentials,
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
    created_at: row.created_at as Date,
    updated_at: row.updated_at as Date,
  };
}

/** The row, or null when the store has never configured fiscalisation. */
export async function getFiscalSettings(storeId: number): Promise<PosFiscalSettings | null> {
  const result = await pool.query(`SELECT * FROM pos_fiscal_settings WHERE store_id = $1`, [
    storeId,
  ]);
  return result.rows.length > 0 ? mapRow(result.rows[0]) : null;
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
  opts: { requireEnabled?: boolean } = {}
): Promise<FiscalCredentials | null> {
  const requireEnabled = opts.requireEnabled ?? true;
  const settings = await getFiscalSettings(storeId);
  if (!settings || (requireEnabled && !settings.enabled) || !settings.provider) return null;

  const secrets = settings.secrets_encrypted
    ? decryptSecrets(storeId, settings.provider, settings.secrets_encrypted)
    : {};

  return { provider: settings.provider, config: settings.config, secrets };
}

/** Secret-free projection for the wire. */
export function toFiscalSettingsView(
  storeId: number,
  settings: PosFiscalSettings | null
): FiscalSettingsView {
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
      updated_at: null,
    };
  }

  // A row whose envelope no longer decrypts (rotated key, restored backup)
  // reports no credentials rather than failing the whole settings screen — the
  // owner needs that screen precisely to re-enter them.
  let secretsSet: string[] = [];
  if (settings.secrets_encrypted && settings.provider) {
    try {
      secretsSet = Object.keys(
        decryptSecrets(storeId, settings.provider, settings.secrets_encrypted)
      ).sort();
    } catch {
      secretsSet = [];
    }
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
    updated_at: settings.updated_at ? new Date(settings.updated_at).toISOString() : null,
  };
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

  const config = patch.config === undefined ? (existing?.config ?? {}) : validateConfig(patch.config);

  let defaultTaxCode = existing?.default_tax_code ?? null;
  if (patch.default_tax_code !== undefined) {
    const raw = patch.default_tax_code;
    if (raw === null || raw === '') {
      defaultTaxCode = null;
    } else if (typeof raw !== 'string' || !TAX_CODE_RE.test(raw.trim())) {
      throw new FiscalSettingsValidationError('default_tax_code must be 1-16 of [A-Za-z0-9_-]');
    } else {
      defaultTaxCode = raw.trim();
    }
  }

  const autoOpenShift = patch.auto_open_shift ?? existing?.auto_open_shift ?? true;

  let receiptSource = existing?.receipt_source ?? 'local';
  if (patch.receipt_source !== undefined) {
    if (patch.receipt_source !== 'local' && patch.receipt_source !== 'provider') {
      throw new FiscalSettingsValidationError("receipt_source must be 'local' or 'provider'");
    }
    receiptSource = patch.receipt_source;
  }

  const providerChanged = Boolean(existing?.provider) && existing?.provider !== provider;
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
        default_tax_code, auto_open_shift, receipt_source)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
     ON CONFLICT (store_id) DO UPDATE SET
       enabled = EXCLUDED.enabled,
       provider = EXCLUDED.provider,
       config = EXCLUDED.config,
       secrets_encrypted = EXCLUDED.secrets_encrypted,
       secrets_key_version = EXCLUDED.secrets_key_version,
       default_tax_code = EXCLUDED.default_tax_code,
       auto_open_shift = EXCLUDED.auto_open_shift,
       receipt_source = EXCLUDED.receipt_source,
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
    ]
  );

  // A cached session belongs to the provider and credentials it was minted
  // for. Reusing one after the owner switched providers would send a Checkbox
  // token to Вчасно, so any settings write drops the whole runtime entry.
  invalidateStore(storeId);

  return mapRow(result.rows[0]);
}
