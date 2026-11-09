// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

/**
 * HTTP client for `/api/pos/super/*` (TechDocs/POS_SUPER_ADMIN.md). Separate
 * from `services/api.ts` on purpose: a different credential in a different
 * header (`X-POS-Super-Token`), kept in `sessionStorage` so it dies with the
 * tab, and a 401 here means "show the password form", not "log the cashier
 * out".
 */

import axios, { type AxiosAdapter, type AxiosInstance } from 'axios';
import { posApiBase } from '../lib/urls';
import type { ModuleRemoteEntry, VerticalId } from '../types';

export const SUPER_TOKEN_KEY = 'pos_super_token';
const SUPER_TOKEN_HEADER = 'X-POS-Super-Token';

export interface SuperStoreRow {
  id: number;
  name: string;
  slug: string;
  currency: string;
  created_at: string;
  /** What the store sells — writable here and nowhere else. */
  vertical: VerticalId;
  enabled_modules: string[];
  module_remotes: Record<string, string | ModuleRemoteEntry>;
  live_tiktok_username: string | null;
  fiscal: { enabled: boolean; provider: string | null };
  staff_count: number;
  last_sale_at: string | null;
}

export interface RepointReport {
  updated: Array<{ id: number; slug: string }>;
  skipped: Array<{ id: number; slug: string }>;
  failed: Array<{ id: number; slug: string; error: string }>;
}

/** A lead's place in the CRM (TechDocs/CRM_LEADS.md). */
export type SuperLeadStatus = 'new' | 'contacted' | 'demo' | 'client' | 'lost';

/** The visitor's path as the server kept it (`src/crm/journey.ts`). */
export interface SuperLeadJourney {
  first?: SuperLeadTouchOrigin;
  last?: SuperLeadTouchOrigin;
  visits?: number;
  firstVisitAt?: string;
  pages?: Array<{ p: string; at?: string }>;
  ctas?: Array<{ id: string; p?: string; at?: string }>;
  device?: 'mobile' | 'desktop';
}

export interface SuperLeadTouchOrigin {
  at?: string;
  ref?: string;
  landing?: string;
  utm?: Partial<Record<'source' | 'medium' | 'campaign' | 'term' | 'content', string>>;
  click?: Partial<Record<'gclid' | 'fbclid' | 'ttclid', string>>;
}

/** One form the person sent, with the server's reading of it. */
export interface SuperLeadTouch {
  id: number;
  created_at: string;
  form_id: string;
  intent: string | null;
  product: string | null;
  business: string | null;
  page_path: string | null;
  name_given: string | null;
  journey: SuperLeadJourney;
  source: string;
  first_source: string;
  signals: string[];
  days_to_lead: number | null;
}

export interface SuperLeadRow {
  id: number;
  phone: string;
  name: string | null;
  status: SuperLeadStatus;
  note: string;
  created_at: string;
  last_touch_at: string;
  touches: number;
  interest: string | null;
  last: SuperLeadTouch | null;
}

export interface SuperLeadList {
  items: SuperLeadRow[];
  total: number;
  counts: Record<SuperLeadStatus, number>;
}

export interface SuperLeadCard extends Omit<SuperLeadRow, 'last'> {
  history: SuperLeadTouch[];
}

export interface SuperLeadFilter {
  status?: SuperLeadStatus;
  interest?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

/**
 * A licence as the activation ingest sees it (TechDocs/POS_LICENSING.md, phase
 * 2F). `fingerprint` is '' for the «без ключа» group; the detail is fetched by
 * `fingerprint || 'none'`.
 */
export interface SuperLicenseSummary {
  fingerprint: string;
  verified: boolean;
  licensee: string | null;
  plan: string | null;
  instance_limit: number | null;
  installs: number;
  origins: number;
  over_limit: boolean;
  cloned: boolean;
  first_seen: string;
  last_seen: string;
  total_pings: number;
}

export interface SuperLicenseOrigin {
  url: string;
  /** Where the last ping came from, when the server kept it (an older server sends none). */
  ip?: string | null;
  first_seen: string;
  last_seen: string;
  seen_count: number;
}

export interface SuperLicenseInstance {
  instance_id: string;
  verified: boolean;
  last_seen: string;
  origins: SuperLicenseOrigin[];
  cloned: boolean;
}

export interface SuperLicenseDetail extends SuperLicenseSummary {
  instances: SuperLicenseInstance[];
}

/** One place in the super admin's «QR-меню» tab (TechDocs/POS_MENU_WALL.md). */
export interface MenuScansStoreRow {
  id: number;
  name: string;
  slug: string;
  menu_enabled: boolean;
  today: number;
  last7d: number;
  last30d: number;
  total: number;
  table_today: number;
  tables_total: number;
  last_at: string | null;
}

export interface MenuScansSummary {
  /** The Kyiv day the counts are of. */
  day: string;
  today: number;
  last7d: number;
  last30d: number;
  total: number;
  table_today: number;
  stores: MenuScansStoreRow[];
}

/** The television's snapshot — `src/pos/menu-opens.service.ts` is the source of these shapes. */
export interface MenuWallTable {
  id: number;
  name: string;
  pos_x: number;
  pos_y: number;
  width: number;
  height: number;
  shape: 'rect' | 'round';
  today: number;
  lastAt: string | null;
}

export interface MenuWallHall {
  id: number;
  name: string;
  tables: MenuWallTable[];
}

export interface MenuWallStore {
  id: number;
  name: string;
  slug: string;
  logoUrl: string | null;
  today: number;
  lastHour: number;
  last3h: number;
  lastAt: string | null;
  hourly: number[];
  tableToday: number;
  tablesScanned: number;
  tablesTotal: number;
  /** The floor plan, only for a place whose tables were scanned today. */
  halls: MenuWallHall[] | null;
}

export interface MenuWallEvent {
  id: number;
  storeId: number;
  tableId: number | null;
  tableName: string | null;
  hallName: string | null;
  openedAt: string;
}

export interface MenuWallSnapshot {
  now: string;
  day: string;
  total: number;
  yesterdaySameTime: number;
  hourly: number[];
  tableToday: number;
  bestDay: { day: string; count: number } | null;
  stores: MenuWallStore[];
  events: MenuWallEvent[];
  lastId: number;
}

export function getSuperToken(): string | null {
  try {
    return sessionStorage.getItem(SUPER_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setSuperToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(SUPER_TOKEN_KEY, token);
    else sessionStorage.removeItem(SUPER_TOKEN_KEY);
  } catch {
    /* storage blocked — the session simply does not persist */
  }
}

type UnauthorizedListener = () => void;

export class SuperApi {
  private client: AxiosInstance;
  private listeners = new Set<UnauthorizedListener>();

  constructor(adapter?: AxiosAdapter) {
    this.client = axios.create({ baseURL: `${posApiBase()}/super`, timeout: 20000, adapter });
    this.client.interceptors.request.use((config) => {
      const token = getSuperToken();
      if (token) config.headers[SUPER_TOKEN_HEADER] = token;
      return config;
    });
    this.client.interceptors.response.use(
      (res) => res,
      (error) => {
        if (axios.isAxiosError(error) && error.response?.status === 401 && !error.config?.url?.endsWith('/login')) {
          setSuperToken(null);
          for (const fn of this.listeners) fn();
        }
        return Promise.reject(error);
      }
    );
  }

  /** Called when a request comes back 401 — the token expired or was revoked. */
  onUnauthorized(fn: UnauthorizedListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async login(password: string): Promise<void> {
    const { data } = await this.client.post<{ token: string; expires_at: string }>('/login', { password });
    setSuperToken(data.token);
  }

  logout(): void {
    setSuperToken(null);
  }

  async listStores(): Promise<SuperStoreRow[]> {
    const { data } = await this.client.get<SuperStoreRow[]>('/stores');
    return data;
  }

  /**
   * «Новий магазин» (TechDocs/POS_ONBOARDING.md, O1). The owner's password goes
   * out once, in this body, and the answer never carries it back.
   */
  async createStore(body: {
    name: string;
    slug: string;
    template_store_id: number | null;
    owner_login: string;
    owner_password: string;
    owner_name?: string;
  }): Promise<SuperStoreRow> {
    const { data } = await this.client.post<SuperStoreRow>('/stores', body);
    return data;
  }

  async patchStore(
    id: number,
    body: {
      enabled_modules?: string[];
      module_remotes?: Record<string, string | ModuleRemoteEntry>;
      vertical?: VerticalId;
    }
  ): Promise<SuperStoreRow> {
    const { data } = await this.client.patch<SuperStoreRow>(`/stores/${id}`, body);
    return data;
  }

  async previewChoiceQr(storeId: number, url: string): Promise<ChoiceQrPlan> {
    const { data } = await this.client.post<ChoiceQrPlan>(`/stores/${storeId}/import/choiceqr`, { url }, { timeout: 60_000 });
    return data;
  }

  /** One chunk of the import; each downloads its cards' photos, hence the longer timeout. */
  async importChoiceQrChunk(storeId: number, url: string, offset: number, limit: number): Promise<ChoiceQrChunk> {
    const { data } = await this.client.post<ChoiceQrChunk>(
      `/stores/${storeId}/import/choiceqr`,
      { url, apply: true, offset, limit },
      { timeout: 180_000 }
    );
    return data;
  }

  async repoint(body: { module_id: string; url: string; store_ids?: number[] }): Promise<RepointReport> {
    const { data } = await this.client.post<RepointReport>('/module-remotes/repoint', body);
    return data;
  }

  /** The marketing site's leads, newest activity first (TechDocs/CRM_LEADS.md). */
  async listLeads(filter: SuperLeadFilter = {}): Promise<SuperLeadList> {
    const params = Object.fromEntries(Object.entries(filter).filter(([, v]) => v !== undefined && v !== ''));
    const { data } = await this.client.get<SuperLeadList>('/leads', { params });
    return data;
  }

  async getLead(id: number): Promise<SuperLeadCard> {
    const { data } = await this.client.get<SuperLeadCard>(`/leads/${id}`);
    return data;
  }

  /** The two things the super admin writes: the status and the note. */
  async patchLead(id: number, body: { status?: SuperLeadStatus; note?: string }): Promise<SuperLeadCard> {
    const { data } = await this.client.patch<SuperLeadCard>(`/leads/${id}`, body);
    return data;
  }

  /** Licence activations, most recently seen first (TechDocs/POS_LICENSING.md). */
  /** The «QR-меню» tab: opens of the guest menu per place (TechDocs/POS_MENU_WALL.md). */
  async menuScans(): Promise<MenuScansSummary> {
    const { data } = await this.client.get<MenuScansSummary>('/menu-scans');
    return data;
  }

  /** The read-only key the television's page carries in its address. */
  async menuWallKey(): Promise<string> {
    const { data } = await this.client.get<{ key: string }>('/menu-wall-key');
    return data.key;
  }

  /**
   * The television's snapshot. Gated by the key, not the super token: the
   * screen never logs in. `after` is the cursor of the last seen open.
   */
  async menuWall(key: string, after: number): Promise<MenuWallSnapshot> {
    const { data } = await this.client.get<MenuWallSnapshot>('/menu-wall', { params: { key, after } });
    return data;
  }

  /** «Принтери»: profiles the tills reported and the ones approved for every till (TechDocs/POS_PRINTER_PROFILES.md). */
  async printerProfiles(): Promise<SuperPrinterProfiles> {
    const { data } = await this.client.get<SuperPrinterProfiles>('/printer-profiles');
    return data;
  }

  /** Approves a reported profile for its driver under a readable name; replaces the driver's previous one. */
  async approvePrinterReport(reportId: number, title: string): Promise<SuperPrinterProfile> {
    const { data } = await this.client.post<SuperPrinterProfile>(`/printer-profiles/reports/${reportId}/approve`, { title });
    return data;
  }

  async renamePrinterProfile(id: number, title: string): Promise<SuperPrinterProfile> {
    const { data } = await this.client.patch<SuperPrinterProfile>(`/printer-profiles/${id}`, { title });
    return data;
  }

  async removePrinterProfile(id: number): Promise<void> {
    await this.client.delete(`/printer-profiles/${id}`);
  }

  async removePrinterReport(id: number): Promise<void> {
    await this.client.delete(`/printer-profiles/reports/${id}`);
  }

  async listLicenses(): Promise<SuperLicenseSummary[]> {
    const { data } = await this.client.get<SuperLicenseSummary[]>('/licenses');
    return data;
  }

  async getLicense(fingerprint: string): Promise<SuperLicenseDetail> {
    const { data } = await this.client.get<SuperLicenseDetail>(`/licenses/${fingerprint || 'none'}`);
    return data;
  }

  /** Forget every ping of one licence — the «Без ключа» row a copy left before its key was set. */
  async deleteLicense(fingerprint: string): Promise<{ deleted: number }> {
    const { data } = await this.client.delete<{ deleted: number }>(`/licenses/${fingerprint || 'none'}`);
    return data;
  }
}


/** «Імпорт з ChoiceQR»: what the page would become (TechDocs/POS_ONBOARDING.md, O2). */
export interface ChoiceQrPlan {
  place: { name: string; address: string | null; phone: string | null; hours: Record<string, { open: string; close: string }> | null; logo: boolean };
  tags: Array<{ name: string; station: 'kitchen' | 'bar'; exists: boolean; products: number }>;
  products: Array<{ name: string; tag: string; variants: Array<{ size: string | null; price_cents: number }>; photo_url: string | null; exists: boolean }>;
  warnings: string[];
  totals: { tags_new: number; products_new: number; products_existing: number; variants_new: number; photos: number };
}

export interface ChoiceQrChunk {
  total: number;
  next_offset: number;
  done: boolean;
  created: string[];
  skipped_existing: number;
  photos_failed: string[];
  profile?: string[];
}

export const superApi = new SuperApi();

/** Human text for a failed super request. */
export function superErrorText(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const body = error.response?.data as { error?: string } | undefined;
    if (status === 503 && body?.error === 'super_not_configured') {
      return 'На сервері не задано POS_SUPER_PASSWORD — супер-адмінка вимкнена.';
    }
    if (status === 429) return 'Забагато спроб. Зачекайте хвилину.';
    if (status === 401) return 'Невірний пароль.';
    if (body?.error) return body.error;
    if (!error.response) return 'Немає зв’язку з сервером.';
  }
  return error instanceof Error ? error.message : 'Помилка';
}

/** Shared printer profiles — `src/pos/printer-profiles.service.ts` is the source of these shapes. */
export type PrinterEncodingTableId = 'windows1251' | 'cp866' | 'cp1125';

export interface SuperPrinterReport {
  id: number;
  driver: string;
  table: PrinterEncodingTableId;
  esc_t: number;
  paper_width_mm: number | null;
  prints: number;
  store_id: number;
  store_code: string;
  store_name: string;
  first_reported_at: string;
  last_reported_at: string;
  approved: boolean;
}

export interface SuperPrinterProfile {
  id: number;
  driver: string;
  title: string;
  table: PrinterEncodingTableId;
  esc_t: number;
  source_store_id: number | null;
  source_store_code: string | null;
  approved_at: string;
  updated_at: string;
}

export interface SuperPrinterProfiles {
  reports: SuperPrinterReport[];
  profiles: SuperPrinterProfile[];
}
