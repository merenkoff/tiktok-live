# 🔧 Рефакторинг - Інструкція по Імплементації

## Phase 1: Database Migrations (1-2 години)

### Крок 1: Оновити таблиці

Виконайте цей SQL скрипт в PostgreSQL:

```sql
-- 1. Create users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  tiktok_username VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  subscription_level VARCHAR(50) DEFAULT 'free'
);

-- 2. Create user_settings table
CREATE TABLE user_settings (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  telegram_bot_token VARCHAR(255),
  telegram_channel_id BIGINT,
  novaposhta_api_key VARCHAR(255),
  novaposhta_merchant_name VARCHAR(255),
  reservation_timeout_minutes INT DEFAULT 5,
  payment_timeout_minutes INT DEFAULT 10,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id)
);

-- 3. Create sessions table
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'stopped',
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Create session_logs table
CREATE TABLE session_logs (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_type VARCHAR(50),
  message TEXT,
  data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Alter existing tables
ALTER TABLE orders ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE orders ADD CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE orders ADD COLUMN session_id INT REFERENCES sessions(id);

ALTER TABLE reservations ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE reservations ADD CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users(id);
ALTER TABLE reservations ADD COLUMN session_id INT REFERENCES sessions(id);

-- 6. Create indexes
CREATE INDEX idx_users_tiktok_username ON users(tiktok_username);
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_orders_session_id ON orders(session_id);
CREATE INDEX idx_reservations_user_id ON reservations(user_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_session_logs_session_id ON session_logs(session_id);
CREATE INDEX idx_session_logs_created_at ON session_logs(created_at DESC);
CREATE INDEX idx_session_logs_user_id ON session_logs(user_id);
```

### Крок 2: Перевірити

```bash
psql -U postgres -d tiktok_live -c "\\dt"
# Має показати всі нові таблиці
```

---

## Phase 2: Backend Structure (2-3 години)

### Крок 1: Створити папки

```bash
mkdir -p src/core
mkdir -p src/users
mkdir -p src/sessions
mkdir -p src/tiktok
mkdir -p src/telegram
mkdir -p src/admin
```

### Крок 2: Скопіювати файли

Я вже створив основні файли:
- ✅ `src/core/types.ts` - TypeScript типи
- ✅ `src/core/auth.ts` - Аутентифікація
- ✅ `src/users/users.service.ts` - User Management
- ✅ `src/sessions/sessions.service.ts` - Session CRUD
- ✅ `src/sessions/sessions.manager.ts` - Active Sessions

---

## Phase 3: Нові API Endpoints (2-3 години)

### Файли для створення:

#### 1. `src/users/users.controller.ts`

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { loginUser, ensureAuth, logoutUser } from '../core/auth.js';
import * as usersService from './users.service.js';
import { logger } from '../core/logger.js';

export async function registerUserRoutes(fastify: FastifyInstance) {
  // Login
  fastify.post<{ Body: { tiktok_username: string } }>(
    '/api/auth/login',
    async (request, reply) => {
      try {
        const { tiktok_username } = request.body;
        
        if (!tiktok_username || tiktok_username.length < 3) {
          reply.status(400).send({ error: 'Invalid username' });
          return;
        }

        const { token, user } = await loginUser(tiktok_username);
        reply.send({ token, user });
      } catch (error) {
        logger.error('Login error', { error });
        reply.status(500).send({ error: 'Login failed' });
      }
    }
  );

  // Logout
  fastify.post(
    '/api/auth/logout',
    async (request, reply) => {
      try {
        const token = request.headers.authorization?.substring(7);
        if (token) {
          logoutUser(token);
        }
        reply.send({ ok: true });
      } catch (error) {
        logger.error('Logout error', { error });
        reply.status(500).send({ error: 'Logout failed' });
      }
    }
  );

  // Get current user
  fastify.get(
    '/api/auth/me',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        const user = await usersService.getUserById(userId);
        reply.send(user);
      } catch (error) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );
}
```

#### 2. `src/users/settings.controller.ts`

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify';
import * as usersService from './users.service.js';
import { ensureAuth } from '../core/auth.js';
import { logger } from '../core/logger.js';

export async function registerSettingsRoutes(fastify: FastifyInstance) {
  // Get settings
  fastify.get(
    '/api/settings',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        const settings = await usersService.getUserSettings(userId);
        
        if (!settings) {
          reply.status(404).send({ error: 'Settings not found' });
          return;
        }

        reply.send(settings);
      } catch (error) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );

  // Save settings
  fastify.put<{ Body: any }>(
    '/api/settings',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        const settings = await usersService.saveUserSettings(userId, request.body);
        reply.send(settings);
      } catch (error) {
        logger.error('Settings save error', { error });
        reply.status(500).send({ error: 'Failed to save settings' });
      }
    }
  );

  // Test Telegram
  fastify.post(
    '/api/settings/test-telegram',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        const settings = await usersService.getUserSettings(userId);
        
        if (!settings?.telegram_bot_token) {
          reply.status(400).send({ error: 'Telegram token not set' });
          return;
        }

        // Simple test - ping Telegram API
        const response = await fetch(
          `https://api.telegram.org/bot${settings.telegram_bot_token}/getMe`
        );

        if (response.ok) {
          reply.send({ ok: true, message: 'Telegram bot is working' });
        } else {
          reply.status(400).send({ error: 'Invalid Telegram token' });
        }
      } catch (error) {
        logger.error('Telegram test error', { error });
        reply.status(500).send({ error: 'Test failed' });
      }
    }
  );
}
```

#### 3. `src/sessions/sessions.controller.ts`

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify';
import { sessionManager } from './sessions.manager.js';
import * as sessionsService from './sessions.service.js';
import { ensureAuth } from '../core/auth.js';
import { logger } from '../core/logger.js';

export async function registerSessionRoutes(fastify: FastifyInstance) {
  // Start session
  fastify.post(
    '/api/sessions/start',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        const activeSession = await sessionManager.startSession(userId);
        reply.send({
          sessionId: activeSession.session.id,
          status: activeSession.session.status,
          startedAt: activeSession.session.started_at
        });
      } catch (error) {
        logger.error('Start session error', { error });
        reply.status(500).send({ error: 'Failed to start session' });
      }
    }
  );

  // Stop session
  fastify.post(
    '/api/sessions/stop',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        await sessionManager.stopSession(userId);
        reply.send({ ok: true });
      } catch (error) {
        logger.error('Stop session error', { error });
        reply.status(500).send({ error: 'Failed to stop session' });
      }
    }
  );

  // Get current session
  fastify.get(
    '/api/sessions/current',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        const session = sessionManager.getSession(userId);
        reply.send(session || null);
      } catch (error) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );

  // Get session logs
  fastify.get<{ Querystring: { limit?: string } }>(
    '/api/sessions/logs',
    async (request, reply) => {
      try {
        const { userId } = ensureAuth(request);
        const limit = parseInt(request.query.limit || '100');
        const logs = sessionManager.getLogs(userId, limit);
        reply.send(logs);
      } catch (error) {
        reply.status(401).send({ error: 'Unauthorized' });
      }
    }
  );

  // Get stats
  fastify.get(
    '/api/sessions/stats',
    async (request, reply) => {
      try {
        const stats = sessionManager.getStats();
        reply.send(stats);
      } catch (error) {
        logger.error('Get stats error', { error });
        reply.status(500).send({ error: 'Failed to get stats' });
      }
    }
  );
}
```

---

## Phase 4: WebSocket для Live Logs (1-2 години)

### Файл: `src/api/websocket.ts`

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify';
import { sessionManager } from '../sessions/sessions.manager.js';
import { ensureAuth } from '../core/auth.js';
import { logger } from '../core/logger.js';

export async function setupWebSocket(fastify: FastifyInstance) {
  fastify.register(require('@fastify/websocket'));

  fastify.get<{ Querystring: { token?: string } }>(
    '/api/sessions/logs/stream',
    { websocket: true },
    async (socket, request) => {
      try {
        // Auth via query params (for WebSocket)
        const token = request.query.token;
        if (!token) {
          socket.close();
          return;
        }

        // Verify token
        const auth = require('../core/auth.js').verifyToken(token);
        if (!auth) {
          socket.close();
          return;
        }

        const userId = auth.userId;
        logger.info(`WebSocket connected for user ${userId}`);

        // Send initial logs
        const initialLogs = sessionManager.getLogs(userId, 100);
        socket.send(JSON.stringify({
          type: 'initial',
          logs: initialLogs
        }));

        // Listen for new logs
        const onLogAdded = (event: any) => {
          if (event.user_id === userId) {
            socket.send(JSON.stringify({
              type: 'log',
              log: event.log
            }));
          }
        };

        sessionManager.on('logAdded', onLogAdded);

        // On disconnect
        socket.on('close', () => {
          sessionManager.off('logAdded', onLogAdded);
          logger.info(`WebSocket disconnected for user ${userId}`);
        });

        socket.on('error', (error) => {
          logger.error('WebSocket error', { error, userId });
        });
      } catch (error) {
        logger.error('WebSocket setup error', { error });
        socket.close();
      }
    }
  );
}
```

---

## Phase 5: Оновити index.ts

```typescript
import 'dotenv/config';
import cron from 'node-cron';
import { logger } from './core/logger.js';
import { initializeDatabase } from './core/db.js';
import { startServer } from './api/api.js';
import { setupWebSocket } from './api/websocket.js';
import { registerUserRoutes } from './users/users.controller.js';
import { registerSettingsRoutes } from './users/settings.controller.js';
import { registerSessionRoutes } from './sessions/sessions.controller.js';
import { sessionManager } from './sessions/sessions.manager.js';

async function main() {
  try {
    logger.info('Starting TikTok LIVE Automation Platform...');

    // Initialize database
    await initializeDatabase();

    // Start API server
    const fastify = await startServer();

    // Setup WebSocket
    await setupWebSocket(fastify);

    // Register routes
    await registerUserRoutes(fastify);
    await registerSettingsRoutes(fastify);
    await registerSessionRoutes(fastify);

    // Cleanup old sessions every day
    cron.schedule('0 0 * * *', async () => {
      try {
        // Note: Need to implement cleanup
      } catch (error) {
        logger.error('Cleanup error', { error });
      }
    });

    logger.info('✅ Platform started successfully');
  } catch (error) {
    logger.error('Startup error', { error });
    process.exit(1);
  }
}

main();
```

---

## Завдання для Реалізації

### ✅ Вже зроблено:
- [x] Архітектурний план
- [x] Database schema
- [x] TypeScript типи
- [x] Users Service
- [x] Sessions Service
- [x] Sessions Manager
- [x] Auth middleware

### 🔜 Потрібно зробити:

1. **Database Migration** (SQL)
   - [ ] Запустити SQL скрипт
   - [ ] Перевірити таблиці

2. **Backend Endpoints** (TypeScript)
   - [ ] Реалізувати User Controller
   - [ ] Реалізувати Settings Controller
   - [ ] Реалізувати Sessions Controller
   - [ ] Реалізувати WebSocket

3. **Admin Panel** (React)
   - [ ] Login Page
   - [ ] Settings Page
   - [ ] Session Control Page
   - [ ] Live Logs Component

4. **Інтеграція**
   - [ ] Per-user TikTok instance
   - [ ] Per-user Telegram bot
   - [ ] Event bus для coordination

---

## Наступний Крок

Скажіть мені яку частину ви хочете почати:

1. **Database Setup** - Рішу SQL схему
2. **Backend Implementation** - Пишу контролери
3. **Admin Panel** - Робимо React інтерфейс
4. **Все разом** - Робимо по порядку

Я готов допомогти з кожним кроком! 🚀
