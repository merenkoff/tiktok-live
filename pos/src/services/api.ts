import axios, { type AxiosInstance } from 'axios';
import type {
  AuthResponse,
  CatalogItem,
  PosCustomer,
  PosTag,
  Product,
  SaleDetail,
  SaleListItem,
  StaffMember,
  SalesSummary,
  CustomerChild,
  Supplier,
  StockDocument,
  StockDocumentType,
  StockDocumentStatus,
  StockDocumentLine,
  OnHandRow,
  LowStockRow,
  StockMovementRow,
  MovementSummaryRow,
} from '../types';
import { posApiBase } from '../lib/urls';

const TOKEN_KEY = 'pos_token';
const AUTH_KEY = 'pos_auth';

export function isNetworkError(error: unknown): boolean {
  return axios.isAxiosError(error) && !error.response;
}

export function isUnauthorized(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 401;
}

class PosApi {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: posApiBase(),
      timeout: 15000,
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token && !token.startsWith('offline:')) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
  }

  hasLiveJwt(): boolean {
    const token = localStorage.getItem(TOKEN_KEY);
    const auth = this.loadAuth();
    if (!token || !auth || token.startsWith('offline:')) return false;
    return new Date(auth.expires_at).getTime() > Date.now();
  }

  saveAuth(auth: AuthResponse) {
    localStorage.setItem(TOKEN_KEY, auth.token);
    localStorage.setItem(AUTH_KEY, JSON.stringify(auth));
  }

  clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(AUTH_KEY);
  }

  loadAuth(): AuthResponse | null {
    const raw = localStorage.getItem(AUTH_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!raw || !token) return null;
    try {
      return JSON.parse(raw) as AuthResponse;
    } catch {
      return null;
    }
  }

  async loginOwner(login: string, password: string): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>('/auth/owner/login', {
      login,
      password,
    });
    this.saveAuth(data);
    return data;
  }

  async loginPin(store_slug: string, pin: string): Promise<AuthResponse> {
    const { data } = await this.client.post<AuthResponse>('/auth/staff/pin', {
      store_slug,
      pin,
    });
    this.saveAuth(data);
    return data;
  }

  async logout(): Promise<void> {
    try {
      if (this.hasLiveJwt()) await this.client.post('/auth/logout');
    } finally {
      this.clearAuth();
    }
  }

  async me(): Promise<AuthResponse> {
    const { data } = await this.client.get<AuthResponse>('/me');
    this.saveAuth(data);
    return data;
  }

  async getCatalog(params?: {
    q?: string;
    barcode?: string;
    tag_id?: number;
    snapshot?: boolean;
  }): Promise<CatalogItem[]> {
    const { snapshot, ...rest } = params ?? {};
    const { data } = await this.client.get<CatalogItem[]>('/catalog', {
      params: snapshot ? { ...rest, all: '1' } : rest,
    });
    return data;
  }

  async getProducts(): Promise<Product[]> {
    const { data } = await this.client.get<Product[]>('/products');
    return data;
  }

  async createProduct(payload: {
    name: string;
    description?: string;
    image_url?: string | null;
    variants: Array<{
      size?: string;
      color?: string;
      sku?: string;
      barcode?: string;
      price_cents: number;
      quantity?: number;
    }>;
  }): Promise<Product> {
    const { data } = await this.client.post<Product>('/products', payload);
    return data;
  }

  async updateProduct(
    id: number,
    payload: Partial<{
      name: string;
      description: string;
      image_url: string | null;
      is_active: boolean;
    }>
  ): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/products/${id}`, payload);
    return data;
  }

  async uploadProductImage(file: File): Promise<{ url: string; filename: string }> {
    const body = new FormData();
    body.append('file', file);
    const { data } = await this.client.post<{ url: string; filename: string }>('/uploads', body, {
      timeout: 60000,
    });
    return data;
  }

  async addVariant(
    productId: number,
    payload: {
      size?: string;
      color?: string;
      sku?: string;
      barcode?: string;
      price_cents: number;
      quantity?: number;
      compare_at_cents?: number | null;
    }
  ): Promise<Product> {
    const { data } = await this.client.post<Product>(`/products/${productId}/variants`, payload);
    return data;
  }

  async updateVariant(
    id: number,
    payload: Partial<{
      size: string;
      color: string;
      sku: string;
      barcode: string;
      price_cents: number;
      compare_at_cents: number | null;
      is_active: boolean;
    }>
  ): Promise<Product> {
    const { data } = await this.client.patch<Product>(`/variants/${id}`, payload);
    return data;
  }

  async archiveProduct(id: number): Promise<Product> {
    const { data } = await this.client.post<Product>(`/products/${id}/archive`);
    return data;
  }

  async archiveVariant(id: number): Promise<Product> {
    const { data } = await this.client.post<Product>(`/variants/${id}/archive`);
    return data;
  }

  async getTags(): Promise<PosTag[]> {
    const { data } = await this.client.get<PosTag[]>('/tags');
    return data;
  }

  async createTag(payload: {
    name: string;
    parent_id?: number | null;
    color?: string | null;
    show_in_catalog_bar?: boolean;
  }): Promise<PosTag> {
    const { data } = await this.client.post<PosTag>('/tags', payload);
    return data;
  }

  async updateTag(
    id: number,
    payload: {
      name?: string;
      color?: string | null;
      show_in_catalog_bar?: boolean;
      sort_order?: number;
    }
  ): Promise<PosTag> {
    const { data } = await this.client.patch<PosTag>(`/tags/${id}`, payload);
    return data;
  }

  async deleteTag(id: number): Promise<void> {
    await this.client.delete(`/tags/${id}`);
  }

  async setProductTags(productId: number, tag_ids: number[]): Promise<number[]> {
    const { data } = await this.client.put<{ tag_ids: number[] }>(`/products/${productId}/tags`, {
      tag_ids,
    });
    return data.tag_ids;
  }

  async assignTag(tagId: number, product_ids: number[]) {
    const { data } = await this.client.post<{ assigned: number }>(`/tags/${tagId}/assign`, {
      product_ids,
    });
    return data;
  }

  async adjustStock(variant_id: number, delta: number, note?: string) {
    const { data } = await this.client.post('/stock/adjust', { variant_id, delta, note });
    return data as { variant_id: number; quantity: number };
  }

  async completeSale(payload: {
    items: Array<{ variant_id: number; quantity: number }>;
    payments: Array<{ method: 'cash' | 'card'; amount_cents: number }>;
    note?: string;
    cart_discount?: { type: 'percent' | 'fixed'; value: number } | null;
    customer_id?: number | null;
    client_uuid?: string | null;
  }): Promise<SaleDetail> {
    const { data } = await this.client.post<SaleDetail>('/sales/complete', payload);
    return data;
  }

  async listCustomers(q?: string, snapshot = false): Promise<PosCustomer[]> {
    const { data } = await this.client.get<PosCustomer[]>('/customers', {
      params: {
        ...(q ? { q } : {}),
        ...(snapshot ? { all: '1' } : {}),
      },
    });
    return data;
  }

  async getCustomer(id: number): Promise<PosCustomer> {
    const { data } = await this.client.get<PosCustomer>(`/customers/${id}`);
    return data;
  }

  async createCustomer(payload: {
    name: string;
    phone: string;
    email?: string | null;
    children_birthdays?: CustomerChild[];
    client_uuid?: string | null;
  }): Promise<PosCustomer> {
    const { data } = await this.client.post<PosCustomer>('/customers', payload);
    return data;
  }

  async updateCustomer(
    id: number,
    payload: {
      name?: string;
      phone?: string;
      email?: string | null;
      children_birthdays?: CustomerChild[];
      client_uuid?: string | null;
    }
  ): Promise<PosCustomer> {
    const { data } = await this.client.patch<PosCustomer>(`/customers/${id}`, payload);
    return data;
  }

  async deleteCustomer(id: number): Promise<void> {
    await this.client.delete(`/customers/${id}`);
  }

  async listSales(limit = 50): Promise<SaleListItem[]> {
    const { data } = await this.client.get<SaleListItem[]>('/sales', { params: { limit } });
    return data;
  }

  async getSale(id: number): Promise<SaleDetail> {
    const { data } = await this.client.get<SaleDetail>(`/sales/${id}`);
    return data;
  }

  async voidSale(id: number): Promise<SaleDetail> {
    const { data } = await this.client.post<SaleDetail>(`/sales/${id}/void`);
    return data;
  }

  async refundSale(
    id: number,
    items: Array<{ sale_item_id: number; quantity: number }>,
    reason?: string
  ): Promise<SaleDetail> {
    const { data } = await this.client.post<SaleDetail>(`/sales/${id}/refunds`, {
      items,
      reason,
    });
    return data;
  }

  async salesSummary(params: { from?: string; to?: string } = {}): Promise<SalesSummary> {
    const { data } = await this.client.get<SalesSummary>('/analytics/summary', { params });
    return data;
  }

  async listStaff(): Promise<StaffMember[]> {
    const { data } = await this.client.get<StaffMember[]>('/staff');
    return data;
  }

  async createSeller(display_name: string, pin: string) {
    const { data } = await this.client.post('/staff', { display_name, pin });
    return data as { id: number };
  }

  async setStaffPin(id: number, pin: string) {
    await this.client.post(`/staff/${id}/pin`, { pin });
  }

  async setStaffActive(id: number, is_active: boolean) {
    await this.client.patch(`/staff/${id}`, { is_active });
  }

  async updateStore(name: string) {
    const { data } = await this.client.patch('/store', { name });
    return data as { id: number; name: string; slug: string; currency: string };
  }

  async getStore() {
    const { data } = await this.client.get('/store');
    return data as { id: number; name: string; slug: string; currency: string; timezone: string };
  }

  async listSuppliers(): Promise<Supplier[]> {
    const { data } = await this.client.get<Supplier[]>('/suppliers');
    return data;
  }

  async createSupplier(payload: { name: string; phone?: string; note?: string }): Promise<Supplier> {
    const { data } = await this.client.post<Supplier>('/suppliers', payload);
    return data;
  }

  async listStockDocuments(params?: {
    type?: StockDocumentType;
    status?: StockDocumentStatus;
    from?: string;
    to?: string;
  }): Promise<StockDocument[]> {
    const { data } = await this.client.get<StockDocument[]>('/stock/documents', { params });
    return data;
  }

  async getStockDocument(id: number): Promise<StockDocument> {
    const { data } = await this.client.get<StockDocument>(`/stock/documents/${id}`);
    return data;
  }

  async createStockDocument(payload: {
    type: StockDocumentType;
    occurred_at?: string;
    supplier_id?: number | null;
    reason_code?: string | null;
    note?: string | null;
  }): Promise<StockDocument> {
    const { data } = await this.client.post<StockDocument>('/stock/documents', payload);
    return data;
  }

  async addStockDocumentLine(
    documentId: number,
    payload: {
      variant_id: number;
      quantity?: number;
      unit_cost_cents?: number | null;
      counted_qty?: number | null;
      target_qty?: number;
      line_note?: string | null;
    }
  ): Promise<StockDocumentLine> {
    const { data } = await this.client.post<StockDocumentLine>(
      `/stock/documents/${documentId}/lines`,
      payload
    );
    return data;
  }

  async addStockDocumentPlaceholderLine(
    documentId: number,
    payload: {
      name: string;
      quantity: number;
      price_cents: number;
      unit_cost_cents?: number | null;
      size?: string;
      color?: string;
      barcode?: string | null;
      line_note?: string | null;
    }
  ): Promise<StockDocumentLine & { similar_products?: { id: number; name: string }[] }> {
    const { data } = await this.client.post<
      StockDocumentLine & { similar_products?: { id: number; name: string }[] }
    >(`/stock/documents/${documentId}/lines/placeholder`, payload);
    return data;
  }

  async updateStockDocumentLine(
    documentId: number,
    lineId: number,
    payload: {
      quantity?: number;
      unit_cost_cents?: number | null;
      counted_qty?: number | null;
      line_note?: string | null;
      placeholder_name?: string;
      placeholder_size?: string;
      placeholder_color?: string;
      placeholder_barcode?: string | null;
      placeholder_price_cents?: number;
    }
  ): Promise<StockDocumentLine> {
    const { data } = await this.client.patch<StockDocumentLine>(
      `/stock/documents/${documentId}/lines/${lineId}`,
      payload
    );
    return data;
  }

  async removeStockDocumentLine(documentId: number, lineId: number): Promise<void> {
    await this.client.delete(`/stock/documents/${documentId}/lines/${lineId}`);
  }

  async bulkInventoryLines(
    documentId: number,
    payload: { tag_ids?: number[]; product_ids?: number[]; variant_ids?: number[] }
  ): Promise<StockDocumentLine[]> {
    const { data } = await this.client.post<StockDocumentLine[]>(
      `/stock/documents/${documentId}/lines/bulk`,
      payload
    );
    return data;
  }

  async refreshInventorySystemQty(documentId: number): Promise<StockDocumentLine[]> {
    const { data } = await this.client.post<StockDocumentLine[]>(
      `/stock/documents/${documentId}/refresh-system-qty`
    );
    return data;
  }

  async postStockDocument(documentId: number, idempotencyKey?: string): Promise<StockDocument> {
    const { data } = await this.client.post<StockDocument>(
      `/stock/documents/${documentId}/post`,
      {},
      idempotencyKey ? { headers: { 'Idempotency-Key': idempotencyKey } } : undefined
    );
    return data;
  }

  async reverseStockDocument(documentId: number, note?: string): Promise<StockDocument> {
    const { data } = await this.client.post<StockDocument>(`/stock/documents/${documentId}/reverse`, {
      note,
    });
    return data;
  }

  async voidStockDocument(documentId: number): Promise<void> {
    await this.client.delete(`/stock/documents/${documentId}`);
  }

  async getGtinCache(
    code: string
  ): Promise<
    { found: true; gtin: string; name: string | null; brand: string | null; image_url: string | null; best_source: string | null } | { found: false }
  > {
    try {
      const { data } = await this.client.get(`/gtin/${encodeURIComponent(code)}`);
      return data;
    } catch (err) {
      if (err && typeof err === 'object' && 'response' in err) {
        const status = (err as { response?: { status?: number } }).response?.status;
        if (status === 404) return { found: false };
      }
      throw err;
    }
  }

  async ingestGtin(
    gtin: string,
    results: Array<{
      source: string;
      found: boolean;
      name?: string | null;
      brand?: string | null;
      image_url?: string | null;
    }>
  ): Promise<{ found: boolean; hint: {
    gtin: string;
    name: string | null;
    brand: string | null;
    image_url: string | null;
    best_source: string | null;
  } | null }> {
    const { data } = await this.client.post('/gtin/ingest', { gtin, results });
    return data;
  }

  async lookupGtinQuotaProviders(gtin: string): Promise<{
    found: boolean;
    hint: {
      gtin: string;
      name: string | null;
      brand: string | null;
      image_url: string | null;
      best_source: string | null;
    } | null;
    skipped?: Array<{ provider: string; skipped: string }>;
  }> {
    const { data } = await this.client.post('/gtin/lookup/quota-providers', { gtin });
    return data;
  }

  async stockOnHand(): Promise<OnHandRow[]> {
    const { data } = await this.client.get<OnHandRow[]>('/stock/reports/on-hand');
    return data;
  }

  async stockLow(): Promise<LowStockRow[]> {
    const { data } = await this.client.get<LowStockRow[]>('/stock/low');
    return data;
  }

  async stockMovements(params?: {
    from?: string;
    to?: string;
    variant_id?: number;
    reason?: string;
  }): Promise<StockMovementRow[]> {
    const { data } = await this.client.get<StockMovementRow[]>('/stock/reports/movements', {
      params,
    });
    return data;
  }

  async stockMovementSummary(from: string, to: string): Promise<MovementSummaryRow[]> {
    const { data } = await this.client.get<MovementSummaryRow[]>(
      '/stock/reports/movement-summary',
      { params: { from, to } }
    );
    return data;
  }
}

export const api = new PosApi();
