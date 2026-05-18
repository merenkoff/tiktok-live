import { Pool } from 'pg';
import { logger } from './logger.js';

/** Published host port from this repo's docker-compose (avoids clashing with other Postgres on 5432). */
const defaultDbPort = '5433';

function isConnectionRefused(err: unknown): boolean {
  const e = err as NodeJS.ErrnoException & { errors?: NodeJS.ErrnoException[] };
  if (e?.code === 'ECONNREFUSED') return true;
  return Array.isArray(e?.errors) && e.errors.some((x) => x?.code === 'ECONNREFUSED');
}

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || defaultDbPort, 10),
      database: process.env.DB_NAME || 'tiktok_live',
      user: process.env.DB_USER || 'postgres',
      password:
        process.env.NODE_ENV === 'production'
          ? process.env.DB_PASSWORD
          : (process.env.DB_PASSWORD ?? 'postgres'),
    });

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

export async function initializeDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        tiktok_nickname VARCHAR(255) NOT NULL,
        telegram_id BIGINT,
        product_code VARCHAR(50) NOT NULL,
        size VARCHAR(10) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'reserved', 'waiting_payment', 'paid', 'shipped', 'delivered', 'cancelled')),
        customer_name VARCHAR(255),
        phone VARCHAR(20),
        city VARCHAR(255),
        nova_poshta_branch VARCHAR(255),
        tracking_number VARCHAR(50),
        payment_confirmed_at TIMESTAMP,
        shipped_at TIMESTAMP,
        notes TEXT,
        UNIQUE(id)
      );

      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
      CREATE INDEX IF NOT EXISTS idx_orders_tiktok_nickname ON orders(tiktok_nickname);
      CREATE INDEX IF NOT EXISTS idx_orders_telegram_id ON orders(telegram_id);

      CREATE TABLE IF NOT EXISTS reservations (
        id SERIAL PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        tiktok_nickname VARCHAR(255) NOT NULL,
        product_code VARCHAR(50) NOT NULL,
        size VARCHAR(10) NOT NULL,
        order_id INT REFERENCES orders(id) ON DELETE CASCADE,
        UNIQUE(product_code, size)
      );

      CREATE INDEX IF NOT EXISTS idx_reservations_expires_at ON reservations(expires_at);
      CREATE INDEX IF NOT EXISTS idx_reservations_tiktok_nickname ON reservations(tiktok_nickname);

      CREATE TABLE IF NOT EXISTS telegram_users (
        telegram_id BIGINT PRIMARY KEY,
        username VARCHAR(255),
        first_name VARCHAR(255),
        last_name VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_interaction TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS inventory (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) NOT NULL,
        size VARCHAR(10) NOT NULL,
        quantity INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(product_code, size)
      );

      CREATE INDEX IF NOT EXISTS idx_inventory_product_code ON inventory(product_code);

      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        phone VARCHAR(20) NOT NULL UNIQUE,
        name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'rejected')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
      CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
    `);

    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database', error);
    if (isConnectionRefused(error)) {
      const host = process.env.DB_HOST || 'localhost';
      const port = process.env.DB_PORT || defaultDbPort;
      logger.error(
        `PostgreSQL is not reachable at ${host}:${port}. Start the DB: npm run docker:deps` +
          ' (or docker compose up -d postgres). Align .env with .env.example (DB_PORT, DB_PASSWORD).',
      );
    }
    throw error;
  }
}

export { pool };
