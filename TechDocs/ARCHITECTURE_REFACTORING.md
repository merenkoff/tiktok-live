# 🏗️ Архітектурний План - TikTok LIVE Automation Platform

## Phase 1: Фундамент (Multi-User Architecture)

### 1.1 Оновлена Database Schema

```sql
-- Users (Sellers)
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  tiktok_username VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_active BOOLEAN DEFAULT TRUE,
  subscription_level VARCHAR(50) DEFAULT 'free' -- free, pro, enterprise
);

-- User Settings (API Keys, Credentials)
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

-- Sessions (LIVE Stream Sessions)
CREATE TABLE sessions (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'stopped', -- stopped, running, paused
  started_at TIMESTAMP,
  stopped_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Orders (Updated to include user_id)
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INT REFERENCES sessions(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  tiktok_nickname VARCHAR(255) NOT NULL,
  telegram_id BIGINT,
  product_code VARCHAR(50) NOT NULL,
  size VARCHAR(10) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  customer_name VARCHAR(255),
  phone VARCHAR(20),
  city VARCHAR(255),
  nova_poshta_branch VARCHAR(255),
  tracking_number VARCHAR(50),
  payment_confirmed_at TIMESTAMP,
  shipped_at TIMESTAMP
);

-- Reservations (Updated)
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id INT REFERENCES sessions(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  tiktok_nickname VARCHAR(255) NOT NULL,
  product_code VARCHAR(50) NOT NULL,
  size VARCHAR(10) NOT NULL,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE
);

-- Session Logs (Chat Messages from TikTok & Telegram)
CREATE TABLE session_logs (
  id SERIAL PRIMARY KEY,
  session_id INT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  log_type VARCHAR(50), -- 'tiktok_comment', 'telegram_message', 'order', 'error'
  message TEXT,
  data JSONB, -- Store additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session_logs_session_id (session_id),
  INDEX idx_session_logs_created_at (created_at DESC)
);

-- Indexes
CREATE INDEX idx_orders_user_id ON orders(user_id);
CREATE INDEX idx_reservations_user_id ON reservations(user_id);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_user_settings_user_id ON user_settings(user_id);
```

---

## Phase 2: Backend Architecture

### 2.1 Folder Structure

```
src/
├── core/                          # Базовий функціонал
│   ├── db.ts                      # Database pool
│   ├── logger.ts                  # Logging
│   └── auth.ts                    # User authentication (TikTok username)
│
├── users/                         # User Management
│   ├── users.service.ts           # User CRUD
│   ├── settings.service.ts        # Settings management
│   └── users.controller.ts        # REST endpoints
│
├── sessions/                      # Session Management
│   ├── sessions.service.ts        # Session CRUD
│   ├── sessions.manager.ts        # Runtime session manager
│   └── sessions.controller.ts     # REST endpoints
│
├── tiktok/                        # TikTok Integration (Per-User)
│   ├── tiktok.manager.ts          # Manages multiple instances
│   ├── tiktok.instance.ts         # Single user instance
│   └── parser.ts                  # Order parsing (unchanged)
│
├── telegram/                      # Telegram Bot (Per-User)
│   ├── telegram.manager.ts        # Manages multiple bots
│   ├── telegram.instance.ts       # Single bot instance
│   └── telegram.controller.ts     # Bot handlers
│
├── orders/                        # Order Management
│   ├── orders.service.ts          # Updated with user_id
│   └── orders.controller.ts       # REST endpoints
│
├── reservations/                  # Reservations (unchanged)
│   ├── reservations.service.ts
│   └── reservations.controller.ts
│
├── sessions-logs/                 # Session Logging
│   ├── session-logs.service.ts
│   └── session-logs.controller.ts
│
├── novaposhta/                    # Nova Poshta (unchanged)
│   └── novaposhta.client.ts
│
├── admin/                         # Admin Panel
│   ├── admin.controller.ts        # Admin API endpoints
│   └── admin.middleware.ts        # Auth middleware
│
├── api/                           # Fastify setup
│   ├── api.ts                     # Fastify initialization
│   └── routes.ts                  # Route registration
│
└── index.ts                       # Main entry point
```

### 2.2 Key Services Architecture

#### SessionManager (Управління активними сесіями)

```typescript
// src/sessions/sessions.manager.ts

interface ActiveSession {
  userId: number;
  sessionId: number;
  tiktokManager: TikTokInstance;
  telegramManager: TelegramInstance;
  settings: UserSettings;
  logs: SessionLog[];
}

export class SessionManager {
  private activeSessions: Map<number, ActiveSession> = new Map();
  
  async startSession(userId: number, sessionId: number): Promise<void> {
    const settings = await this.loadUserSettings(userId);
    const tiktok = new TikTokInstance(userId, settings);
    const telegram = new TelegramInstance(userId, settings);
    
    this.activeSessions.set(userId, {
      userId,
      sessionId,
      tiktokManager: tiktok,
      telegramManager: telegram,
      settings,
      logs: []
    });
    
    await tiktok.connect();
    await telegram.start();
  }
  
  async stopSession(userId: number): Promise<void> {
    const session = this.activeSessions.get(userId);
    if (!session) return;
    
    await session.tiktokManager.disconnect();
    await session.telegramManager.stop();
    this.activeSessions.delete(userId);
  }
  
  getSession(userId: number): ActiveSession | undefined {
    return this.activeSessions.get(userId);
  }
  
  addLog(userId: number, log: SessionLog): void {
    const session = this.activeSessions.get(userId);
    if (session) {
      session.logs.push(log);
      // Keep only last 1000 messages in memory
      if (session.logs.length > 1000) {
        session.logs = session.logs.slice(-1000);
      }
      // Persist to database
      this.persistLog(userId, log);
    }
  }
  
  getLogs(userId: number, limit: number = 100): SessionLog[] {
    const session = this.activeSessions.get(userId);
    return session?.logs.slice(-limit) || [];
  }
}
```

#### TikTokInstance (Per-User Instance)

```typescript
// src/tiktok/tiktok.instance.ts

export class TikTokInstance extends EventEmitter {
  private connection: any = null;
  private userId: number;
  private settings: UserSettings;
  private isConnected = false;
  private reconnectAttempts = 0;
  
  constructor(userId: number, settings: UserSettings) {
    super();
    this.userId = userId;
    this.settings = settings;
  }
  
  async connect(): Promise<void> {
    try {
      const module = await import('tiktok-live-connector');
      const { WebcastPushConnection } = module;
      
      this.connection = new WebcastPushConnection(
        this.settings.tiktok_username
      );
      
      this.connection.on('chat', async (data: any) => {
        await this.handleComment(data);
      });
      
      await this.connection.connect();
      this.isConnected = true;
      
      this.emit('connected', {
        userId: this.userId,
        username: this.settings.tiktok_username
      });
    } catch (error) {
      logger.error(`TikTok connection failed for user ${this.userId}`, error);
      this.handleDisconnect();
    }
  }
  
  private async handleComment(data: any): Promise<void> {
    const { uniqueId, comment } = data;
    
    const parsed = parseOrder(comment);
    if (!parsed) return;
    
    const reservation = await createReservation(
      this.userId,
      parsed.productCode,
      parsed.size,
      uniqueId
    );
    
    if (reservation) {
      this.emit('orderDetected', {
        userId: this.userId,
        order: parsed,
        nickname: uniqueId
      });
    }
  }
}
```

#### TelegramInstance (Per-User Bot)

```typescript
// src/telegram/telegram.instance.ts

export class TelegramInstance {
  private bot: Telegraf<BotContext>;
  private userId: number;
  private settings: UserSettings;
  
  constructor(userId: number, settings: UserSettings) {
    this.userId = userId;
    this.settings = settings;
    this.bot = new Telegraf(settings.telegram_bot_token);
    this.setupHandlers();
  }
  
  private setupHandlers(): void {
    this.bot.start(async (ctx) => {
      // User-specific greeting
      await ctx.reply(`Welcome to ${ctx.botInfo.first_name}!`);
    });
    
    this.bot.on('text', async (ctx) => {
      // User-specific handling with user_id context
      await this.handleMessage(ctx);
    });
  }
  
  async start(): Promise<void> {
    await this.bot.launch();
    logger.info(`Telegram bot started for user ${this.userId}`);
  }
  
  async stop(): Promise<void> {
    await this.bot.stop();
  }
  
  async sendMessage(chatId: number, text: string): Promise<void> {
    await this.bot.telegram.sendMessage(chatId, text, {
      parse_mode: 'HTML'
    });
  }
}
```

---

## Phase 3: Admin Panel (Frontend)

### 3.1 Tech Stack

- **Framework**: React 18 (TypeScript)
- **State**: TanStack Query + Zustand
- **UI**: Shadcn/ui + Tailwind CSS
- **Realtime**: WebSocket for logs
- **API Client**: Axios with interceptors

### 3.2 Pages Structure

```
admin/
├── src/
│   ├── pages/
│   │   ├── LoginPage.tsx           # TikTok Username Login
│   │   ├── DashboardPage.tsx       # Overview
│   │   ├── SettingsPage.tsx        # Credentials & Configuration
│   │   ├── SessionPage.tsx         # Start/Stop & Live Logs
│   │   ├── OrdersPage.tsx          # Order History
│   │   └── NotFound.tsx
│   │
│   ├── components/
│   │   ├── LoginForm.tsx
│   │   ├── SettingsForm.tsx
│   │   ├── SessionControl.tsx      # Start/Stop buttons
│   │   ├── LiveLogs.tsx            # Real-time message display
│   │   ├── OrdersTable.tsx
│   │   ├── TelegramPreview.tsx     # Mock telegram messages
│   │   └── TikTokPreview.tsx       # Mock tiktok comments
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useSession.ts
│   │   ├── useLogs.ts
│   │   └── useOrders.ts
│   │
│   ├── services/
│   │   ├── api.ts                  # API client
│   │   ├── websocket.ts            # WebSocket for logs
│   │   └── auth.ts                 # Local auth
│   │
│   ├── types/
│   │   └── index.ts                # TypeScript types
│   │
│   └── App.tsx
```

### 3.3 Key Pages

#### LoginPage
```
┌─────────────────────────────────┐
│     TikTok LIVE Automation      │
│                                 │
│  TikTok Username:               │
│  [evelin_kids          ]         │
│                                 │
│        [Login]                  │
└─────────────────────────────────┘
```

#### SettingsPage
```
┌────────────────────────────────────┐
│ Settings - evelin_kids             │
├────────────────────────────────────┤
│                                    │
│ Telegram                           │
│ ┌──────────────────────────────┐  │
│ │ Bot Token: [***]              │  │
│ │ Channel ID: [-100123]         │  │
│ └──────────────────────────────┘  │
│                                    │
│ Nova Poshta (Optional)             │
│ ┌──────────────────────────────┐  │
│ │ API Key: [***]               │  │
│ │ Merchant: [evelin_kids]      │  │
│ └──────────────────────────────┘  │
│                                    │
│ Reservation Settings               │
│ ┌──────────────────────────────┐  │
│ │ Timeout (min): [5]           │  │
│ │ Payment Timeout: [10]        │  │
│ └──────────────────────────────┘  │
│                                    │
│              [Save]               │
└────────────────────────────────────┘
```

#### SessionPage (Main Control Panel)
```
┌────────────────────────────────────────────────┐
│ Live Session - evelin_kids                     │
├────────────────────────────────────────────────┤
│                                                │
│ Status: ● Running   Duration: 45 min          │
│                                                │
│ ┌──────────────────────┬──────────────────┐  │
│ │ [■ Stop Session]     │ [🔄 Refresh]     │  │
│ └──────────────────────┴──────────────────┘  │
│                                                │
│ ┌─────────────────────────────────────────┐  │
│ │ Live Messages (Real-Time)               │  │
│ ├─────────────────────────────────────────┤  │
│ │                                         │  │
│ │ 14:32 [TikTok] evelin_kids: A12 92    │  │
│ │ ✅ Order detected & reserved            │  │
│ │                                         │  │
│ │ 14:33 [Telegram] John: /start          │  │
│ │ Bot: Welcome! Enter name...            │  │
│ │                                         │  │
│ │ 14:34 [Telegram] John: John Doe        │  │
│ │ Bot: Enter phone number...             │  │
│ │                                         │  │
│ │ 14:35 [Order Created] #123             │  │
│ │ Customer: John Doe, Phone: +380...    │  │
│ │                                         │  │
│ │ [Loading more...]                       │  │
│ └─────────────────────────────────────────┘  │
│                                                │
│ Orders Created Today: 12                      │
│ Revenue: $240                                 │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Phase 4: API Endpoints

### 4.1 Auth

```
POST /api/auth/login
  Body: { tiktok_username: string }
  Response: { token, user }

POST /api/auth/logout
  Response: { ok }
```

### 4.2 Settings

```
GET  /api/settings
  Response: UserSettings

PUT  /api/settings
  Body: Partial<UserSettings>
  Response: UserSettings

POST /api/settings/test-telegram
  Response: { ok, message }

POST /api/settings/test-novaposhta
  Response: { ok, message }
```

### 4.3 Sessions

```
POST /api/sessions/start
  Response: { sessionId, status }

POST /api/sessions/stop
  Response: { ok }

GET  /api/sessions/current
  Response: Session | null

GET  /api/sessions/logs?limit=100&type=all
  Response: SessionLog[]

WS   /api/sessions/logs/stream
  Real-time logs via WebSocket
```

### 4.4 Orders (User-scoped)

```
GET  /api/orders?status=pending&limit=20
  Response: Order[]

GET  /api/orders/:id
  Response: Order

PUT  /api/orders/:id
  Body: Partial<Order>
  Response: Order

POST /api/orders/:id/send-tracking
  Body: { trackingNumber }
  Response: { ok }
```

---

## Phase 5: Database Migrations

```typescript
// migrations/001_initial_schema.ts
export async function up(pool: Pool): Promise<void> {
  // Create users table
  // Create user_settings table
  // Create sessions table
  // Create session_logs table
  // Create orders (add user_id)
  // Create reservations (add user_id)
  // Create indexes
}

export async function down(pool: Pool): Promise<void> {
  // Rollback
}
```

---

## Phase 6: Deployment Architecture

### 6.1 Docker Compose (Single Instance, Multi-User)

```yaml
version: '3.8'

services:
  api:
    build: .
    ports:
      - '3000:3000'
    depends_on:
      - postgres
      - redis
    environment:
      DB_HOST: postgres
      REDIS_HOST: redis
      NODE_ENV: production

  admin:
    build: ./admin
    ports:
      - '3001:3000'
    depends_on:
      - api

  postgres:
    image: postgres:16
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine

  nginx:
    image: nginx:alpine
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
```

---

## Phase 7: Implementation Timeline

### Week 1: Backend Foundation
- [ ] Database schema + migrations
- [ ] Users & Settings services
- [ ] Session Manager
- [ ] Session Logs service

### Week 2: TikTok & Telegram Integration
- [ ] Per-user TikTok instances
- [ ] Per-user Telegram instances
- [ ] Event bus for order detection
- [ ] API endpoints

### Week 3: Admin Panel
- [ ] Login page
- [ ] Settings page
- [ ] Session control page
- [ ] Orders page
- [ ] Live logs (WebSocket)

### Week 4: Polish & Testing
- [ ] End-to-end testing
- [ ] Performance optimization
- [ ] Security hardening
- [ ] Documentation

---

## Key Design Decisions

### ✅ Why This Architecture?

1. **Multi-User Isolation**: Кожен користувач має свої екземпляри TikTok & Telegram
2. **Session-Based**: Можна запускати/зупиняти сесії незалежно
3. **Real-Time Logs**: WebSocket для live моніторингу
4. **Scalable**: Готово для Redis Queue (BullMQ) в майбутньому
5. **Clean Code**: Розділення concerns, легко тестувати

### 📊 Data Flow

```
User Login
  ↓
Load Settings from DB
  ↓
Start Session
  ├─ TikTok Instance connects
  ├─ Telegram Bot starts
  └─ Session created in DB
  ↓
Monitor Live
  ├─ TikTok comments → parse → reservation
  ├─ Reservation → Telegram notification
  ├─ Telegram flow → order creation
  └─ All logged to session_logs
  ↓
Admin Panel
  ├─ Receives logs via WebSocket
  ├─ Shows real-time updates
  └─ Can manage orders
```

---

## Next Steps

1. ✅ **Confirm architecture** - Все добре?
2. 🔨 **Start implementation** - Почнемо з Backend
3. 🎨 **Build Admin Panel** - React компоненти
4. 🧪 **Testing** - E2E tests
5. 🚀 **Deploy** - Production setup

