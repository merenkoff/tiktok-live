// src/db.ts - Database connection and initialization

import { Pool } from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create connection pool (Railway: DATABASE_URL; local: DB_HOST/…)
export const pool = new Pool(
  process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        database: process.env.DB_NAME || 'tiktok_live',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      }
);

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

/**
 * Test database connection
 */
export async function testConnection(): Promise<void> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    logger.info(`✅ Database connection successful ${result}`);
  } catch (error) {
    logger.error('❌ Database connection failed', { error });
    throw error;
  }
}

/**
 * Initialize database schema
 */
export async function initializeDatabase(): Promise<void> {
  try {
    // Test connection
    await testConnection();

    // Read migration file
    const migrationPath = path.join(__dirname, '..', 'migrations', '001_create_schema.sql');
    
    if (!fs.existsSync(migrationPath)) {
      logger.warn(`⚠️  Migration file not found at ${migrationPath}`);
      logger.info('Creating basic schema...');
      await createBasicSchema();
      return;
    }

    const schema = fs.readFileSync(migrationPath, 'utf-8');

    // Strip full-line SQL comments, then split. Do NOT drop statements that merely
    // start with a section comment — that previously skipped CREATE TABLE and left
    // CREATE INDEX failing with 42P01 (relation does not exist).
    const withoutLineComments = schema
      .split('\n')
      .filter((line) => {
        const trimmed = line.trim();
        return trimmed.length > 0 && !trimmed.startsWith('--');
      })
      .join('\n');

    const statements = withoutLineComments
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const statement of statements) {
      try {
        await pool.query(statement);
      } catch (error: any) {
        // Ignore "already exists" and benign index/column races on existing DBs
        if (
          error.code === '42P07' || // duplicate_table
          error.code === '42701' || // duplicate_column
          error.code === '42P16' || // invalid_table_definition (e.g. duplicate constraint)
          error.code === '23505' // unique_violation while creating unique index on dirty data
        ) {
          logger.debug(`ℹ️  Skipping schema object: ${error.message}`);
        } else if (error.code === '42703') {
          // undefined_column — usually CREATE INDEX before column evolve; retry after ALTERs
          logger.warn(`⚠️  Schema statement skipped (missing column): ${error.message}`);
        } else {
          throw error;
        }
      }
    }

    // Ensure leads columns used by src/leads.ts exist on older DBs
    await pool.query(`ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'new'`);
    await pool.query(
      `ALTER TABLE leads ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    );
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status)`);
    try {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS leads_phone_unique ON leads(phone)`);
    } catch (error: any) {
      if (error.code !== '23505' && error.code !== '42P07') {
        logger.warn(`⚠️  Could not ensure leads_phone_unique: ${error.message}`);
      }
    }

    logger.info('✅ Database schema initialized');
  } catch (error) {
    logger.error('Failed to initialize database', { error });
    throw error;
  }
}

/**
 * Fallback: Create basic schema if migration file not found
 */
async function createBasicSchema(): Promise<void> {
  try {
    // Users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id BIGSERIAL PRIMARY KEY,
        tiktok_username VARCHAR(255) NOT NULL UNIQUE,
        is_active BOOLEAN DEFAULT true,
        subscription_level VARCHAR(50) DEFAULT 'free',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_users_tiktok_username ON users(tiktok_username);
    `);

    // User settings
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_settings (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        tiktok_username VARCHAR(255),
        telegram_bot_token VARCHAR(255),
        telegram_channel_id BIGINT,
        novaposhta_api_key VARCHAR(255),
        novaposhta_merchant_name VARCHAR(255),
        reservation_timeout_minutes INTEGER DEFAULT 5,
        payment_timeout_minutes INTEGER DEFAULT 10,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_user_settings_user_id ON user_settings(user_id);
    `);

    // Sessions
    await pool.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'stopped',
        started_at TIMESTAMP,
        stopped_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    `);

    // Session logs
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_logs (
        id BIGSERIAL PRIMARY KEY,
        session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        log_type VARCHAR(50) NOT NULL,
        message TEXT,
        data JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs(session_id);
    `);

    // Orders
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id BIGINT REFERENCES sessions(id) ON DELETE SET NULL,
        order_code VARCHAR(50),
        product_code VARCHAR(50),
        size VARCHAR(50),
        quantity INTEGER DEFAULT 1,
        tiktok_nickname VARCHAR(255),
        telegram_user_id BIGINT,
        customer_name VARCHAR(255),
        phone_number VARCHAR(20),
        city VARCHAR(255),
        branch VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        payment_status VARCHAR(50) DEFAULT 'unpaid',
        tracking_number VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
    `);

    // Reservations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reservations (
        id BIGSERIAL PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        session_id BIGINT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        product_code VARCHAR(50) NOT NULL,
        size VARCHAR(50) NOT NULL,
        tiktok_nickname VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'reserved',
        expires_at TIMESTAMP,
        converted_to_order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_reservations_user_id ON reservations(user_id);
    `);

    logger.info('✅ Basic schema created');
  } catch (error) {
    logger.error('Failed to create basic schema', { error });
    throw error;
  }
}

/**
 * Close pool connection
 */
export async function closePool(): Promise<void> {
  try {
    await pool.end();
    logger.info('✅ Database pool closed');
  } catch (error) {
    logger.error('Error closing database pool', { error });
  }
}

/**
 * Execute raw query
 */
export async function query(text: string, params?: any[]): Promise<any> {
  try {
    return await pool.query(text, params);
  } catch (error) {
    logger.error('Database query error', { error, text });
    throw error;
  }
}