import axios, { type AxiosInstance } from 'axios';
import type {
  AuthResponse,
  CatalogItem,
  PosTag,
  Product,
  SaleDetail,
  SaleListItem,
  StaffMember,
  TodayAnalytics,
} from '../types';
import { posApiBase } from '../lib/urls';

const TOKEN_KEY = 'pos_token';
const AUTH_KEY = 'pos_auth';

class PosApi {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: posApiBase(),
      timeout: 15000,
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem(TOKEN_KEY);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });
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
      await this.client.post('/auth/logout');
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
  }): Promise<CatalogItem[]> {
    const { data } = await this.client.get<CatalogItem[]>('/catalog', { params });
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

  async createTag(payload: { name: string; parent_id?: number | null }): Promise<PosTag> {
    const { data } = await this.client.post<PosTag>('/tags', payload);
    return data;
  }

  async updateTag(id: number, payload: { name?: string }): Promise<PosTag> {
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
  }): Promise<SaleDetail> {
    const { data } = await this.client.post<SaleDetail>('/sales/complete', payload);
    return data;
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

  async today(): Promise<TodayAnalytics> {
    const { data } = await this.client.get<TodayAnalytics>('/analytics/today');
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
}

export const api = new PosApi();
