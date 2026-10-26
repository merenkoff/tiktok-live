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
