# Architecture & System Design

> ⚠️ **HISTORICAL — archived 2026-09-06.** Describes the original single-user /
> single-stream MVP and references an `inventory` table that was never built.
> Kept for design context only; **not** current truth. For the live system read
> `src/core/types.ts` + the service files, `CLAUDE.md` (repo root), and
> `TechDocs/NOTES.md` (tracked drift).

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         TikTok LIVE SALES AUTOMATION             │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│   TikTok LIVE    │
│  (WebSocket)     │
└────────┬─────────┘
         │ Comments (JSON)
         ▼
┌──────────────────────────┐         ┌──────────────────┐
│ TikTok Live Manager      │────────▶│ Order Parser     │
│ (tiktok.ts)              │         │ (parser.ts)      │
│ - Auto-reconnect         │         │ - Regex matching │
│ - Rate limiting          │         │ - Validation     │
│ - Event emission         │         └──────────────────┘
└──────────────────────────┘                  │
         │                                    │ Valid orders
         │ Orders detected                    ▼
         │                          ┌──────────────────────────┐
         │                          │ Reservation System       │
         │                          │ (reservations.ts)        │
         │                          │ - ACID transactions      │
         │                          │ - 5-min auto-expiry      │
         │                          │ - Duplicate prevention   │
         │                          └──────┬───────────────────┘
         │                                 │ Reservation created
         │                                 ▼
         │                          ┌──────────────────────────┐
         │                          │ Telegram Bot             │
         │                          │ (telegram.ts)            │
         │                          │ - Send confirmation      │
         │                          │ - Collect customer data  │
         │                          │ - Display options        │
         │                          └──────┬───────────────────┘
         │                                 │ Order flow
         │                                 ▼
         │                          ┌──────────────────────────┐
         │                          │ Order Management         │
         │                          │ (orders.ts)              │
         │                          │ - Create/update orders   │
         │                          │ - Track status           │
         │                          │ - Store customer data    │
         │                          └──────┬───────────────────┘
         │                                 │ Order confirmed
         │                                 ▼
         │                          ┌──────────────────────────┐
         │                          │ Nova Poshta Client       │
         │                          │ (novaposhta.ts)          │
         │                          │ - Create shipment        │
         │                          │ - Generate TTN           │
         │                          │ - Track status           │
         │                          └──────┬───────────────────┘
         │                                 │ TTN generated
         │                                 ▼
         │                          ┌──────────────────────────┐
         │                          │ Telegram Notification    │
         │                          │ - Send tracking number   │
         │                          │ - Delivery updates       │
         │                          └──────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────┐
│                       DATABASE (PostgreSQL)                       │
├──────────────────────────────────────────────────────────────────┤
│ orders           │ reservations      │ telegram_users │ inventory │
│ ─────────────────┼───────────────────┼────────────────┼───────────│
│ id               │ id                │ telegram_id    │ id        │
│ created_at       │ created_at        │ username       │ product   │
│ tiktok_nickname  │ expires_at        │ first_name     │ size      │
│ telegram_id      │ tiktok_nickname   │ last_name      │ quantity  │
│ product_code     │ product_code      │ created_at     │           │
│ size             │ size              │ last_interact  │           │
│ status           │ order_id          │                │           │
│ customer_name    │                   │                │           │
│ phone            │                   │                │           │
│ tracking_number  │                   │                │           │
│ ...              │                   │                │           │
└──────────────────────────────────────────────────────────────────┘

         ▲
         │ Queries/Updates
         │
┌──────────────────────────────────────────────────────────────────┐
│                         API Server (Fastify)                      │
├──────────────────────────────────────────────────────────────────┤
│ GET  /health                    - Health check                    │
│ GET  /api/availability/:p/:s    - Check product availability     │
│ GET  /api/orders/:id            - Get order details              │
│ GET  /api/orders/tiktok/:nick   - User's orders                  │
│ GET  /api/reservations/:nick    - User's reservations            │
│ GET  /api/admin/orders/status   - Orders by status (admin)       │
│ POST /api/admin/cleanup         - Cleanup expired (admin)         │
│ GET  /api/novaposhta/cities     - Get cities                     │
│ GET  /api/novaposhta/branches   - Get branches                   │
└──────────────────────────────────────────────────────────────────┘

         ▲
         │ HTTP Requests
         │
┌──────────────────────────────────────────────────────────────────┐
│                    External Integrations                         │
├──────────────────────────────────────────────────────────────────┤
│ - Telegram API (telegram.org)     - Message delivery             │
│ - Nova Poshta API (novaposhta.ua) - Shipping & tracking          │
│ - TikTok Live Connector (npm)     - Live comments                │
└──────────────────────────────────────────────────────────────────┘
```

## Data Flow - Order Lifecycle

```
1. DETECTION PHASE
   TikTok Comment → Parser → Validation → Available?
                                             ├─Yes─→ Reserve
                                             └─No ──→ Ignore

2. RESERVATION PHASE (5 minutes)
   Reserve Item → Store in DB → Set expiry → Emit event
                                              │
                                              └─→ Notify user

3. ORDER FLOW PHASE
   User opens Telegram → Bot conversation → Collect details
                                              └─→ Save order

4. PAYMENT PHASE
   Order created → Await admin confirmation → Mark as paid

5. SHIPPING PHASE
   Payment approved → Create shipment → Generate TTN → Notify customer

6. DELIVERY PHASE
   TTN assigned → Track delivery → Customer receives
```

## Concurrency & Transactions

### Reservation Creation (ACID)

```sql
BEGIN TRANSACTION
  1. Check if product+size already reserved (with lock)
  2. If available: INSERT reservation
  3. If reserved: ROLLBACK and return null
COMMIT
```

This prevents race conditions where two users reserve the same item simultaneously.

### Order Conversion

```sql
BEGIN TRANSACTION
  1. Get reservation (check expiry)
  2. Create order
  3. Link reservation to order
  4. Update reservation
COMMIT
```

## Error Handling & Resilience

### TikTok Connection

```typescript
Connection Lost
  ↓
Wait 5 seconds
  ↓
Retry connect (exponential backoff)
  ↓
Success? → Continue
Not successful? → Attempt again
Max 10 attempts? → Alert admin
```

### Database Failures

```typescript
Query fails
  ↓
Log error with context
  ↓
Return null / empty array
  ↓
API responds with error
  ↓
Client can retry
```

### Telegram Bot Errors

```typescript
Send message fails
  ↓
Retry (3 times)
  ↓
Log for admin review
  ↓
Continue processing (don't block order flow)
```

## Rate Limiting & Spam Prevention

### Per-User Rate Limiting

```
Same user comments 3 times in 5 seconds
  ↓
Only first comment processed
  ↓
Others ignored until 1 second passes
```

### Comment Validation

```
Comment length > 50 chars? → Ignore
Invalid product code? → Ignore
Invalid size format? → Ignore
Already reserved? → Skip
Price too low/high? → Optional check
```

## Performance Optimizations

### Database Indexes

```sql
-- Fast lookups by status
CREATE INDEX idx_orders_status ON orders(status);

-- Recent orders
CREATE INDEX idx_orders_created_at ON orders(created_at DESC);

-- User history
CREATE INDEX idx_orders_tiktok_nickname ON orders(tiktok_nickname);

-- Telegram user lookups
CREATE INDEX idx_orders_telegram_id ON orders(telegram_id);

-- Reservation expiry cleanup
CREATE INDEX idx_reservations_expires_at ON reservations(expires_at);
```

### Connection Pooling

```typescript
// PostgreSQL pool with optimized settings
const pool = new Pool({
  max: 20,              // Max connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Caching (Future)

```typescript
// Redis cache for:
// - City/branch lists (expires hourly)
// - Reservation TTL (auto-managed)
// - User session data (expires on logout)
```

## Scalability Path

### Current (MVP)
- Single server
- Single database
- Single TikTok stream
- Synchronous processing

### Phase 2 (Next)
- Load balancer
- Read replicas
- Job queue (BullMQ + Redis)
- Multi-stream support

### Phase 3 (Future)
- Microservices (Telegram bot, Nova Poshta integration)
- Event sourcing
- Real-time analytics dashboard
- AI-powered responses

## Security Architecture

```
┌─────────────────────────────────────────┐
│         HTTPS/SSL (TLS 1.3)             │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│        Nginx Reverse Proxy               │
│ - Rate limiting (10 req/s)              │
│ - DDoS protection                       │
│ - Header validation                     │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│         Fastify Application              │
│ - Input validation (Zod)                │
│ - SQL injection prevention              │
│ - CORS configured                       │
└──────────────┬──────────────────────────┘
               ▼
┌─────────────────────────────────────────┐
│      PostgreSQL Database                 │
│ - User role with limited permissions    │
│ - Connection from app only              │
│ - Encrypted passwords (bcrypt ready)    │
└─────────────────────────────────────────┘
```

## Monitoring & Observability

### Metrics to Track

```
- Orders/minute
- Reservation success rate
- Telegram delivery success
- Nova Poshta API latency
- Database query times
- TikTok reconnection rate
- System uptime
```

### Logging Strategy

```
DEBUG   - Comment parsing details, regex matches
INFO    - Orders created, reservations made, key events
WARN    - Connection drops, rate limits, retries
ERROR   - Failed transactions, API errors, critical issues
```

### Health Check Endpoint

```bash
GET /health

{
  "status": "ok|degraded|down",
  "timestamp": "2024-01-15T10:30:45Z",
  "tiktok": {
    "connected": true,
    "reconnectAttempts": 0
  },
  "database": "connected",
  "telegram": "connected"
}
```

## Configuration Tiers

### Development
```env
NODE_ENV=development
LOG_LEVEL=debug
RESERVATION_TIMEOUT_MINUTES=5
API_PORT=3000
```

### Staging
```env
NODE_ENV=staging
LOG_LEVEL=info
RESERVATION_TIMEOUT_MINUTES=5
API_PORT=3000
```

### Production
```env
NODE_ENV=production
LOG_LEVEL=warn
RESERVATION_TIMEOUT_MINUTES=5
API_PORT=3000
```

---

This architecture prioritizes:
- **Reliability**: Auto-reconnect, transaction safety, error handling
- **Scalability**: Connection pooling, indexes, future queue support
- **Security**: Input validation, rate limiting, authentication-ready
- **Observability**: Comprehensive logging and health checks
