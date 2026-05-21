// admin/src/services/api.ts - FIXED

import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type { AuthResponse, UserSettings, Session, SessionLog } from '../types';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      timeout: 10000,
    });

    // Add auth token to requests
    this.client.interceptors.request.use((config) => {
      const token = localStorage.getItem('token');
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
      return config;
    });

    // Handle errors
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/';
        }
        throw error;
      }
    );
  }

  // Auth
  async login(tiktok_username: string): Promise<AuthResponse> {
    const response = await this.client.post<AuthResponse>('/api/auth/login', {
      tiktok_username,
    });
    return response.data;
  }

  async logout(): Promise<void> {
    await this.client.post('/api/auth/logout');
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  }

  async getMe(): Promise<any> {
    const response = await this.client.get('/api/auth/me');
    return response.data;
  }

  // Settings
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

  // Sessions
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

  async getSessionLogs(limit: number = 100): Promise<SessionLog[]> {
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
    const protocol = API_URL.startsWith('https') ? 'wss' : 'ws';
    const host = API_URL.replace(/^https?:\/\//, '');
    return `${protocol}://${host}/api/sessions/logs/stream?token=${token}`;
  }
}

export const api = new ApiClient();