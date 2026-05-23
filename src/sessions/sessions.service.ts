// src/sessions/sessions.service.ts

import { pool } from '../db.js';
import type { Session, SessionLog } from '../core/types.js';
import { logger } from '../logger.js';

export async function createSession(user_id: number): Promise<Session> {
  try {
    const result = await pool.query(
      `INSERT INTO sessions (user_id, status, started_at)
       VALUES ($1, 'running', NOW())
       RETURNING *`,
      [user_id]
    );

    logger.info(`Session created for user ${user_id}`);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to create session', { error, user_id });
    throw error;
  }
}

export async function stopSession(session_id: number): Promise<Session> {
  try {
    const result = await pool.query(
      `UPDATE sessions 
       SET status = 'stopped', stopped_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [session_id]
    );

    if (result.rows.length === 0) {
      throw new Error(`Session ${session_id} not found`);
    }

    logger.info(`Session ${session_id} stopped`);
    return result.rows[0];
  } catch (error) {
    logger.error('Failed to stop session', { error, session_id });
    throw error;
  }
}

export async function getCurrentSession(user_id: number): Promise<Session | null> {
  try {
    const result = await pool.query(
      `SELECT * FROM sessions 
       WHERE user_id = $1 AND status = 'running'
       ORDER BY started_at DESC
       LIMIT 1`,
      [user_id]
    );

    return result.rows[0] || null;
  } catch (error) {
    logger.error('Failed to get current session', { error, user_id });
    throw error;
  }
}

export async function addSessionLog(
  session_id: number,
  user_id: number,
  log_type: SessionLog['log_type'],
  message: string,
  data?: Record<string, any>
): Promise<SessionLog> {
  try {
    const result = await pool.query(
      `INSERT INTO session_logs (session_id, user_id, log_type, message, data)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [session_id, user_id, log_type, message, data ? JSON.stringify(data) : null]
    );

    return result.rows[0];
  } catch (error) {
    logger.error('Failed to add session log', { error, session_id });
    throw error;
  }
}

export async function getSessionLogs(
  session_id: number,
  limit: number = 100,
  logType?: string
): Promise<SessionLog[]> {
  try {
    let query = `SELECT * FROM session_logs WHERE session_id = $1`;
    const params: any[] = [session_id];

    if (logType) {
      query += ` AND log_type = $2`;
      params.push(logType);
    }

    query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);
    return result.rows.reverse(); // Return in chronological order
  } catch (error) {
    logger.error('Failed to get session logs', { error, session_id });
    throw error;
  }
}

export async function cleanupOldSessions(days: number = 30): Promise<number> {
  try {
    const result = await pool.query(
      `DELETE FROM sessions 
       WHERE status = 'stopped' AND stopped_at < NOW() - INTERVAL '1 day' * $1`,
      [days]
    );

    logger.info(`Cleaned up ${result.rowCount} old sessions`);
    return result.rowCount || 0;
  } catch (error) {
    logger.error('Failed to cleanup old sessions', { error });
    throw error;
  }
}
