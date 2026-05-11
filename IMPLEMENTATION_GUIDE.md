# TikTok LIVE Sales Automation - Complete Implementation Guide

## Overview

You now have a **production-ready, MVP-focused** system for automating TikTok LIVE sales. This guide walks you through the complete solution.

## What You Have

### ✅ Core Features Implemented

1. **TikTok LIVE Parser** (`src/tiktok.ts`, `src/parser.ts`)
   - Real-time comment listening with WebSocket
   - Intelligent parsing supporting multiple languages (English, Russian, Ukrainian)
   - Auto-reconnect with exponential backoff
   - Spam prevention & rate limiting

2. **Product Reservation System** (`src/reservations.ts`)
   - First-come-first-served with ACID transactions
   - Automatic 5-minute expiry
   - PostgreSQL-backed with proper indexes
   - Prevents race conditions

3. **Telegram Bot** (`src/telegram.ts`)
   - Customer order flow with inline keyboards
   - City/branch selection
   - Order confirmation
   - Admin notifications

4. **Order Management** (`src/orders.ts`)
   - Order creation, status tracking
   - Customer details collection
   - Payment confirmation
   - Tracking number integration

5. **Nova Poshta Integration** (`src/novaposhta.ts`)
   - Shipment creation
   - Tracking number generation
   - Branch/city lookups
   - Status tracking (ready for automation)

6. **API Server** (`src/api.ts`)
   - Admin endpoints for monitoring
   - Order status queries
   - Availability checks
   - Health monitoring

7. **Infrastructure**
   - Docker & Docker Compose for easy deployment
   - PostgreSQL database with migrations
   - Cron jobs for maintenance
   - Comprehensive logging with Winston
   - TypeScript for type safety

## Project Structure

```
tiktok-live-automation/
├── src/
│   ├── index.ts              # Main entry point
│   ├── db.ts                 # Database init & pool
│   ├── logger.ts             # Logging setup
│   ├── parser.ts             # Order parsing (regex-based)
│   ├── tiktok.ts             # TikTok LIVE manager
│   ├── reservations.ts       # Reservation system
│   ├── orders.ts             # Order CRUD
│   ├── novaposhta.ts         # Shipping API
│   ├── telegram.ts           # Bot & customer flow
│   ├── api.ts                # Fastify API server
│   └── __tests__/            # Unit tests
├── Dockerfile                # Container image
├── docker-compose.yml        # Dev environment
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── README.md                 # Full documentation
├── QUICKSTART.md             # 5-minute setup
├── DEPLOYMENT.md             # Production guide
├── ARCHITECTURE.md           # System design
├── .env.example              # Config template
└── .eslintrc.json            # Linting rules
```

## Getting Started (30 minutes)

### Step 1: Prerequisites (5 minutes)

You need:
- **Node.js 18+** (optional if using Docker)
- **Docker & Docker Compose** (recommended) OR PostgreSQL + Redis
- **Telegram Bot Token** from @BotFather
- **TikTok account** with LIVE capability
- **Nova Poshta API Key** (optional, for shipping)

### Step 2: Setup (10 minutes)

```bash
# Clone or extract the project
cd tiktok-live-automation

# Configure environment
cp .env.example .env

# Edit with your actual values:
# - TIKTOK_USERNAME: your live username
# - TELEGRAM_BOT_TOKEN: token from @BotFather
# - TELEGRAM_CHANNEL_ID: admin notification channel
# - NOVAPOSHTA_API_KEY: optional, from novaposhta
nano .env
```

### Step 3: Run (5 minutes)

```bash
# Option A: Docker (easiest)
docker-compose up -d
sleep 30
docker-compose logs -f app

# Option B: Manual
npm install
npm run build
npm start
```

### Step 4: Test (10 minutes)

1. Go LIVE on TikTok
2. Comment `A12 92` (or `хочу A12` in Russian)
3. Check logs: `docker-compose logs -f app`
4. Open Telegram bot link from notification
5. Complete the order flow

## How It Works

### Order Flow

```
TikTok Comment: "A12 92"
       ↓
Parser extracts: {product: "A12", size: "92"}
       ↓
Check if available (not reserved)
       ↓
Create 5-min reservation in DB
       ↓
Notify user with Telegram link
       ↓
User opens bot → Enters name, phone, city, branch
       ↓
Order created with status "pending"
       ↓
Admin gets notification
       ↓
Admin confirms payment
       ↓
If Nova Poshta configured: auto-create shipment
       ↓
Generate tracking number (TTN)
       ↓
Send to customer via Telegram
```

### Parser Examples

The parser handles these formats:

```
English/International:
  "A12 92"      → Product A12, Size 92
  "B07 104"     → Product B07, Size 104

Russian:
  "хочу A12"    → "I want A12"
  "беру K19"    → "taking K19"
  "нужен A12"   → "need A12"

Product only:
  "A12"         → Just product code (size = 0)
```

## File-by-File Breakdown

### `src/parser.ts` - Order Parsing
- Regex patterns for multiple languages
- Validation of product codes and sizes
- Entry point: `parseOrder(comment: string)`
- Returns: `{productCode, size}` or `null`

### `src/tiktok.ts` - TikTok Connection
- Manages WebSocket connection to TikTok LIVE
- Auto-reconnect with exponential backoff
- Emits events: 'connected', 'orderDetected', 'liveEnded'
- Entry point: `getTikTokManager().connect()`

### `src/reservations.ts` - Reservation Logic
- ACID transactions preventing race conditions
- 5-minute auto-expiry with cron cleanup
- Key functions:
  - `createReservation(productCode, size, nickname)`
  - `isAvailable(productCode, size)`
  - `cleanupExpiredReservations()`

### `src/orders.ts` - Order Management
- CRUD operations for orders
- Status tracking: pending → paid → shipped → delivered
- Key functions:
  - `getOrder(orderId)`
  - `updateOrderDetails(orderId, details)`
  - `confirmPayment(orderId)`
  - `addTrackingNumber(orderId, ttN)`

### `src/novaposhta.ts` - Shipping
- REST API client for Nova Poshta
- Creates shipments and generates tracking numbers
- Key functions:
  - `createInternetDocument(options)` - creates shipment
  - `getTrackingStatus(documentNumber)` - checks delivery
  - `getCities()` / `getBranches(cityRef)` - location data

### `src/telegram.ts` - Bot & Customer Flow
- Telegraf bot with session management
- Conversation flow:
  1. `/start` - Welcome
  2. User reservation → Inline keyboard for confirmation
  3. Name input
  4. Phone input
  5. City selection (inline buttons)
  6. Branch selection (inline buttons)
  7. Order creation
  8. Admin notification
- Admin commands: `/send_tracking`

### `src/api.ts` - API Endpoints
Public endpoints:
- `GET /health` - Health check
- `GET /api/availability/:product/:size` - Check stock
- `GET /api/orders/:id` - Order details
- `GET /api/orders/tiktok/:nickname` - User's orders

Admin endpoints:
- `GET /api/admin/orders/status/:status` - Orders by status
- `POST /api/admin/cleanup` - Cleanup expired
- `GET /api/novaposhta/cities` - City list
- `GET /api/novaposhta/branches/:cityRef` - Branches

### `src/db.ts` - Database
- PostgreSQL pool management
- Auto-initialization of schema
- Tables: orders, reservations, telegram_users, inventory

### `src/index.ts` - Main Entry
- Application startup
- Service initialization order:
  1. Initialize database
  2. Start API server
  3. Start Telegram bot
  4. Setup cron jobs
  5. Connect to TikTok LIVE
- Graceful shutdown handling

## Configuration

### Environment Variables

```bash
# TikTok
TIKTOK_USERNAME=your_live_username

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC-DEF...
TELEGRAM_CHANNEL_ID=-1001234567890

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tiktok_live
DB_USER=postgres
DB_PASSWORD=your_password

# Redis (ready for queue jobs)
REDIS_HOST=localhost
REDIS_PORT=6379

# Nova Poshta (optional)
NOVAPOSHTA_API_KEY=your_key
NOVAPOSHTA_MERCHANT_NAME=your_business_name

# Server
API_PORT=3000
NODE_ENV=development|production
LOG_LEVEL=debug|info|warn|error

# Business Rules (in minutes)
RESERVATION_TIMEOUT_MINUTES=5
PAYMENT_CONFIRMATION_TIMEOUT_MINUTES=10
```

## Database Schema

### Orders Table
```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP,
  tiktok_nickname VARCHAR(255),       -- TikTok user who ordered
  telegram_id BIGINT,                 -- Telegram user ID
  product_code VARCHAR(50),           -- e.g., "A12"
  size VARCHAR(10),                   -- e.g., "92"
  status VARCHAR(50),                 -- pending, paid, shipped, etc
  customer_name VARCHAR(255),         -- From Telegram flow
  phone VARCHAR(20),                  -- From Telegram flow
  city VARCHAR(255),                  -- From Telegram flow
  nova_poshta_branch VARCHAR(255),   -- Selected branch
  tracking_number VARCHAR(50),        -- TTN from Nova Poshta
  payment_confirmed_at TIMESTAMP,
  shipped_at TIMESTAMP
);
```

### Reservations Table
```sql
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,               -- Auto-cleanup
  tiktok_nickname VARCHAR(255),
  product_code VARCHAR(50),
  size VARCHAR(10),
  order_id INT REFERENCES orders(id)  -- Links to order when created
);
```

## API Usage Examples

### Check Product Availability
```bash
curl "http://localhost:3000/api/availability/A12/92"

# Response:
{
  "available": true,
  "reserved": false,
  "reservedBy": null,
  "expiresAt": null
}
```

### Get Orders for a User
```bash
curl "http://localhost:3000/api/orders/tiktok/user123"

# Response:
[
  {
    "id": 1,
    "productCode": "A12",
    "size": "92",
    "status": "shipped",
    "trackingNumber": "20000123456789"
  }
]
```

### Admin: Get Pending Orders
```bash
curl "http://localhost:3000/api/admin/orders/pending"

# Response:
[
  {
    "id": 1,
    "tiktokNickname": "user123",
    "productCode": "A12",
    "status": "waiting_payment",
    "customerName": "John Doe"
  }
]
```

## Testing

### Unit Tests
```bash
npm run test                    # Run all tests
npm run test -- --ui           # Watch mode with UI
npm run test -- parser.test    # Specific test file
```

Test coverage for:
- Order parsing (multiple languages & formats)
- Validation logic
- Edge cases

### Manual Testing

```bash
# Health check
curl http://localhost:3000/health

# Watch logs
docker-compose logs -f app | grep -i "order\|reservation"

# Connect to database
docker-compose exec postgres psql -U postgres tiktok_live

# Check orders
SELECT id, tiktok_nickname, status FROM orders ORDER BY created_at DESC;
```

## Deployment

### Quick Deploy to VPS

```bash
# SSH to VPS
ssh user@vps.example.com

# Clone project
git clone https://github.com/yourrepo/tiktok-live-automation /opt/tiktok-live
cd /opt/tiktok-live

# Configure
cp .env.example .env
nano .env  # Edit with prod values

# Run with Docker Compose
docker-compose -f docker-compose.yml up -d

# Check logs
docker-compose logs -f
```

See `DEPLOYMENT.md` for:
- SSL/HTTPS setup with Nginx
- Database backups
- Security best practices
- Firewall configuration
- Monitoring setup
- Troubleshooting

## Performance Considerations

### Database Optimization
- Indexes on: status, created_at, tiktok_nickname, expires_at
- Connection pooling: max 20 connections
- Cron cleanup of expired reservations every minute

### Scalability
- Current: Single server (1000+ orders/day easily)
- Future: Add Redis queue + workers for Nova Poshta integration
- Further: Multi-stream, microservices, caching

### Rate Limiting
- Per-user: 1 order per second
- Comment length validation: <50 characters
- API: 10 req/s default (Nginx configurable)

## Monitoring & Logs

### Log Locations
```
logs/combined.log      # All events
logs/error.log         # Errors only
```

### Key Log Messages
```
[INFO] Connected to TikTok LIVE @username
[INFO] Order detected: A12 92
[INFO] Reservation created, expires at: ...
[WARN] Reconnecting in 5s (attempt 1/10)
[ERROR] Failed to send Telegram message
```

### Health Endpoint
```bash
curl http://localhost:3000/health

{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45Z",
  "tiktok": {
    "connected": true,
    "reconnectAttempts": 0
  }
}
```

## Common Tasks

### Change Reservation Timeout
Edit `.env`:
```bash
RESERVATION_TIMEOUT_MINUTES=10  # Changed from 5
```
Restart: `docker-compose restart app`

### Add New Product Code
No code change needed! Parser auto-supports A-Z followed by 1-2 digits.
Just use it in TikTok LIVE: "A99", "Z12", etc.

### View All Orders
```bash
docker-compose exec postgres psql -U postgres tiktok_live \
  -c "SELECT * FROM orders ORDER BY created_at DESC;"
```

### Backup Database
```bash
docker-compose exec postgres pg_dump -U postgres tiktok_live | \
  gzip > backup_$(date +%Y%m%d).sql.gz
```

### Reset Database
```bash
docker-compose down -v
docker-compose up -d
# This will recreate empty database
```

## Troubleshooting

### "Can't connect to TikTok"
1. Check TIKTOK_USERNAME in .env
2. Verify account is LIVE now
3. Check logs: `docker-compose logs app | grep -i tiktok`

### "Telegram bot not responding"
1. Test token: `curl https://api.telegram.org/bot<TOKEN>/getMe`
2. Verify TELEGRAM_BOT_TOKEN in .env
3. Check logs: `docker-compose logs app | grep -i telegram`

### "Database error"
1. Restart: `docker-compose restart postgres`
2. Check connection: `docker-compose exec postgres psql -U postgres`
3. Check logs: `docker-compose logs postgres`

### High Memory Usage
1. Check what's using memory: `docker stats`
2. Restart app: `docker-compose restart app`
3. Check for memory leaks in logs

## What's Not Included (Future Features)

These are intentionally left out for MVP simplicity, but ready to add:

- [ ] Auto-reply AI responses to TikTok comments
- [ ] Inventory management & auto-update
- [ ] Admin web dashboard
- [ ] Stream analytics (orders/min, revenue, etc)
- [ ] Automatic clips generation
- [ ] FAQ assistant
- [ ] Multi-stream support
- [ ] Customer CRM panel
- [ ] Payment integration (Stripe, PayPal, etc)
- [ ] SMS notifications
- [ ] WhatsApp integration

## Support & Help

1. **Check logs first**: `docker-compose logs app`
2. **Read docs**: README.md, DEPLOYMENT.md, ARCHITECTURE.md
3. **Test manually**: Use curl commands above
4. **Check database**: Query tables directly
5. **Enable debug logging**: `LOG_LEVEL=debug`

## Key Design Decisions

### Why PostgreSQL?
- ACID transactions for reservation safety
- Better than SQLite for concurrent access
- Proper indexing for large order volumes
- JSON support for future features

### Why Telegraf Bot?
- Simplest Telegram bot library
- Built-in session management
- Inline keyboards for UX
- Well-maintained

### Why Fastify?
- Fastest Node.js web framework
- Excellent TypeScript support
- Minimal dependencies
- Built-in validation

### Why Docker?
- Reproducible environments
- Easy deployment to any VPS
- Isolation of services
- Single `docker-compose up` startup

## Next Steps

1. **Deploy**: Follow DEPLOYMENT.md for production setup
2. **Test**: Run a LIVE test with real orders
3. **Optimize**: Monitor logs and adjust rate limits
4. **Scale**: Add more features from the roadmap
5. **Automate**: Setup monitoring and backups

---

**You now have a working, scalable foundation for TikTok LIVE automation. 🚀**

Start with QUICKSTART.md for immediate setup, then explore the code and customizations!
