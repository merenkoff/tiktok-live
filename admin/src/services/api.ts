// The Live Shop — Copyright (c) 2026 Serhii Merenkov / Technologies LLC
// Licensed under the OwnNet Source License 1.1 (source-available). See LICENSE.
// Commercial use requires a separate agreement: mer.sergei@gmail.com

// admin/src/services/api.ts

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { AuthResponse, UserSettings, Session, SessionLog } from '../types';

const API_URL =
  import.meta.env.VITE_API_URL ??
  (typeof window !== 'undefined' && window.location.hostname === 'localhost'
    ? ''
    : 'https://the-live.shop');

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
    });

    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          const url: string = error.config?.url || '';
          localStorage.removeItem('token');
          localStorage.removeItem('user');

          // /auth/me is handled by loadUser (soft logout). Login never has a token.
          // Other 401s → hard redirect so UI can't stay on broken session pages.
          const isAuthProbe =
            url.includes('/api/auth/me') || url.includes('/api/auth/login');
          if (!isAuthProbe) {
            window.location.replace('/');
          }
        }
        return Promise.reject(error);
      }
    );
  }

  async login(tiktok_username: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/api/auth/login', {
      tiktok_username,
    });
    return response.data;
  }

  async logout(): Promise<void> {
    await this.client.post('/api/auth/logout');
  }

  async getMe(): Promise<any> {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  async getSettings(): Promise<UserSettings> {
    const response = await this.client.get<UserSettings>('/api/settings');
    return response.data;
  }

  async updateSettings(settings: Partial<UserSettings>): Promise<UserSettings> {
    const response = await this.client.put<UserSettings>('/api/settings', settings);
    return response.data;
  }

  async testTelegram(): Promise<{ ok: boolean; message: string }> {
    const response = await this.client.post('/api/settings/test-telegram');
    return response.data;
  }

  async startSession(): Promise<Session> {
    const response = await this.client.post<Session>('/api/sessions/start');
    return response.data;
  }

  async stopSession(): Promise<{ ok: boolean }> {
    const response = await this.client.post('/api/sessions/stop');
    return response.data;
  }

  async getCurrentSession(): Promise<Session | null> {
    const response = await this.client.get<Session | null>('/api/sessions/current');
    return response.data;
  }

  async getSessionLogs(limit = 100): Promise<SessionLog[]> {
    const response = await this.client.get<SessionLog[]>('/api/sessions/logs', {
      params: { limit },
    });
    return response.data;
  }

  async getSessionStats(): Promise<{ isActive: boolean; sessionManager: any }> {
    const response = await this.client.get('/api/sessions/stats');
    return response.data;
  }

  getWebSocketUrl(): string {
    const token = localStorage.getItem('token');
    if (!token) {
      throw new Error('No auth token for WebSocket');
    }

    const isLocal =
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1';

    if (isLocal) {
      return `ws://localhost:3000/api/sessions/logs/stream?token=${encodeURIComponent(token)}`;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host.includes('the-live.shop')
      ? 'the-live.shop'
      : window.location.host;
    return `${protocol}//${host}/api/sessions/logs/stream?token=${encodeURIComponent(token)}`;
  }
}

export const api = new ApiClient();
