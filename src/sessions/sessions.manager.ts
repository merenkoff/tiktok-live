// src/sessions/sessions.manager.ts

import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import type { User, UserSettings, Session, SessionLog } from '../core/types.js';
import * as sessionsService from './sessions.service.js';
import * as usersService from '../users/users.service.js';

export interface ActiveSession {
  user: User;
  session: Session;
  settings: UserSettings;
  tiktokManager?: any;
  telegramManager?: any;
  logs: SessionLog[];
}

export class SessionManager extends EventEmitter {
  private activeSessions: Map<number, ActiveSession> = new Map();
  private readonly maxLogsInMemory = 1000;

  /**
   * Start a new session for a user
   */
  async startSession(user_id: number): Promise<ActiveSession> {
    try {
      // Check if already running
      if (this.activeSessions.has(user_id)) {
        const existing = this.activeSessions.get(user_id);
        if (existing) return existing;
      }

      // Load user data
      const fullData = await usersService.getFullUserData(user_id);
      if (!fullData) {
        throw new Error(`User ${user_id} not found`);
      }

      const { user, settings } = fullData;
      if (!settings) {
        throw new Error(`Settings not configured for user ${user_id}`);
      }

      // TikTok connector needs username on settings
      if (!settings.tiktok_username) {
        settings.tiktok_username = user.tiktok_username;
      }

      // Create session in DB
      const session = await sessionsService.createSession(user_id);

      // Initialize active session
      const activeSession: ActiveSession = {
        user,
        session,
        settings,
        logs: []
      };

      this.activeSessions.set(user_id, activeSession);

      // Emit event
      this.emit('sessionStarted', {
        user_id,
        sessionId: session.id,
        username: user.tiktok_username
      });

      logger.info(`Session started for user ${user_id}`);
      return activeSession;
    } catch (error) {
      logger.error('Failed to start session', { error, user_id });
      throw error;
    }
  }

  /**
   * Stop a running session
   */
  async stopSession(user_id: number): Promise<void> {
    try {
      const active = this.activeSessions.get(user_id);
      if (!active) {
        throw new Error(`No active session for user ${user_id}`);
      }

      // Stop managers
      if (active.tiktokManager) {
        await active.tiktokManager.disconnect();
      }
      if (active.telegramManager) {
        await active.telegramManager.stop();
      }

      // Update session in DB
      await sessionsService.stopSession(active.session.id);

      // Remove from active sessions
      this.activeSessions.delete(user_id);

      // Emit event
      this.emit('sessionStopped', { user_id, sessionId: active.session.id });

      logger.info(`Session stopped for user ${user_id}`);
    } catch (error) {
      logger.error('Failed to stop session', { error, user_id });
      throw error;
    }
  }

  /**
   * Get active session
   */
  getSession(user_id: number): ActiveSession | undefined {
    return this.activeSessions.get(user_id);
  }

  /**
   * Check if user has active session
   */
  isSessionActive(user_id: number): boolean {
    return this.activeSessions.has(user_id);
  }

  /**
   * Add log to session
   */
  async addLog(
    user_id: number,
    logType: SessionLog['log_type'],
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    const active = this.activeSessions.get(user_id);
    if (!active) {
      logger.warn(`No active session for user ${user_id}, log not saved`);
      return;
    }

    try {
      // Save to DB
      const log = await sessionsService.addSessionLog(
        active.session.id,
        user_id,
        logType,
        message,
        data
      );

      // Keep in memory
      active.logs.push(log);
      if (active.logs.length > this.maxLogsInMemory) {
        active.logs = active.logs.slice(-this.maxLogsInMemory);
      }

      // Emit for WebSocket subscribers
      this.emit('logAdded', { user_id, log });
    } catch (error) {
      logger.error('Failed to add log', { error, user_id });
    }
  }

  /**
   * Get logs for session
   */
  getLogs(user_id: number, limit: number = 100): SessionLog[] {
    const active = this.activeSessions.get(user_id);
    if (!active) return [];
    return active.logs.slice(-limit);
  }

  /**
   * Get all logs from DB (for admin)
   */
  async getSessionLogsFromDB(
    user_id: number,
    limit: number = 100
  ): Promise<SessionLog[]> {
    const active = this.activeSessions.get(user_id);
    if (!active) return [];

    return await sessionsService.getSessionLogs(active.session.id, limit);
  }

  /**
   * Set TikTok manager
   */
  setTikTokManager(user_id: number, manager: any): void {
    const active = this.activeSessions.get(user_id);
    if (active) {
      active.tiktokManager = manager;
    }
  }

  /**
   * Set Telegram manager
   */
  setTelegramManager(user_id: number, manager: any): void {
    const active = this.activeSessions.get(user_id);
    if (active) {
      active.telegramManager = manager;
    }
  }

  /**
   * Get all active sessions (admin)
   */
  getAllActiveSessions(): Map<number, ActiveSession> {
    return new Map(this.activeSessions);
  }

  /**
   * Get session statistics
   */
  getStats(): {
    activeSessionsCount: number;
    userIds: number[];
  } {
    return {
      activeSessionsCount: this.activeSessions.size,
      userIds: Array.from(this.activeSessions.keys()),
    };
  }
}

// Singleton instance
export const sessionManager = new SessionManager();
