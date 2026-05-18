# TikTok LIVE Sales Automation 🚀

Automation system for TikTok LIVE sales for children's clothing store. Handles order parsing, reservation management, Telegram bot integration, and Nova Poshta shipment tracking.

Non-technical setup and live operations (Russian): [ИНСТРУКЦИЯ.md](ИНСТРУКЦИЯ.md).

## Features

✅ **Real-time Order Detection** - Parse product codes from TikTok LIVE comments in multiple languages (English/Ukrainian/Russian)

✅ **Product Reservation System** - First-come-first-served with 5-minute auto-expiry

✅ **Telegram Bot Order Flow** - Collect customer details and confirm orders

✅ **Nova Poshta Integration** - Auto-generate tracking numbers and manage shipments

✅ **Admin Dashboard API** - Monitor orders, reservations, and order status

✅ **Auto-Reconnect** - Handles TikTok connection drops with exponential backoff

✅ **Cron Cleanup** - Automatic expiry of stale reservations

## Tech Stack

- **Runtime**: Node.js 18+ / TypeScript
- **API**: Fastify + TypeScript
- **Bot**: Telegraf (Telegram Bot Framework)
- **Database**: PostgreSQL
- **Cache**: Redis (ready for queue implementation)
- **Deployment**: Docker + Docker Compose

## Project Structure

```
tiktok-live-automation/
├── src/
│   ├── index.ts              # Main entry point
│   ├── db.ts                 # Database setup & pool
│   ├── logger.ts             # Winston logger
│   ├── parser.ts             # Order parsing with regex
│   ├── tiktok.ts             # TikTok LIVE connector
│   ├── reservations.ts       # Reservation logic
│   ├── orders.ts             # Order management
│   ├── novaposhta.ts         # Nova Poshta API client
│   ├── telegram.ts           # Telegram bot
│   └── api.ts                # Fastify API server
├── Dockerfile                # Container image
├── docker-compose.yml        # Local dev environment
├── package.json              # Dependencies
├── tsconfig.json             # TypeScript config
├── .env.example              # Environment variables template
└── README.md                 # This file
```

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 12+ (or use Docker)
- Redis (or use Docker)
- Telegram Bot Token (@BotFather)
- TikTok LIVE username
- Nova Poshta API Key (optional, for shipping)

### 1. Clone & Setup

```bash
git clone <repo>
cd tiktok-live-automation

# Copy environment template
cp .env.example .env

# Install dependencies
npm install
```

### 2. Configure Environment Variables

Edit `.env`:

```bash
# TikTok
TIKTOK_USERNAME=your_tiktok_username

# Telegram Bot
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHANNEL_ID=-1001234567890  # Admin notifications

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tiktok_live
DB_USER=postgres
DB_PASSWORD=your_strong_password

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Nova Poshta (optional)
NOVAPOSHTA_API_KEY=your_key
NOVAPOSHTA_MERCHANT_NAME=your_merchant_name

# Server
API_PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

### 3. Run with Docker Compose (Recommended)

```bash
docker-compose up -d

# Check logs
docker-compose logs -f app
```

The system will:
- Start PostgreSQL, Redis, and the Node.js app
- Initialize the database automatically
- Connect to TikTok LIVE
- Start the Telegram bot
- Listen on http://localhost:3000

### 4. Manual Setup (Development)

```bash
# Start PostgreSQL
createdb tiktok_live

# Start Redis
redis-server

# Build
npm run build

# Run
npm start

# Or development with hot reload
npm run dev
```

## How It Works

### Order Flow

```
TikTok LIVE Comment
        ↓
Parser (regex matching)
        ↓
Validate order format
        ↓
Check availability
        ↓
Create reservation (5 min)
        ↓
User opens Telegram link
        ↓
Telegram bot: collect details
        ↓
Create order in DB
        ↓
Admin confirms payment
        ↓
Nova Poshta shipment created
        ↓
TTN sent to customer
```

### Supported Order Formats

The parser supports multiple formats:

```
# English/International
A12 92          → Product A12, Size 92
B07 104         → Product B07, Size 104

# Russian
хочу A12        → "I want A12"
беру K19        → "taking K19"
нужен A12       → "need A12"

# Just product code (if isolated)
A12             → Product A12 (no size)
```

Product code format: `[A-Z][0-9]{1,2}` (e.g., A1, B23, K99)
Size format: `[0-9]{1,3}` (e.g., 92, 104, 0 for unspecified)

## API Endpoints

### Public

```bash
# Health check
GET /health

# Check product availability
GET /api/availability/:productCode/:size

# Get user's TikTok orders
GET /api/orders/tiktok/:nickname

# Get user's reservations
GET /api/reservations/:nickname

# Get specific order
GET /api/orders/:orderId
```

### Admin

```bash
# Get orders by status (pending, reserved, paid, shipped, etc)
GET /api/admin/orders/status/:status

# Get pending payment orders
GET /api/admin/orders/pending

# Cleanup expired reservations
POST /api/admin/cleanup

# Get Nova Poshta cities
GET /api/novaposhta/cities

# Get branches for city
GET /api/novaposhta/branches/:cityRef
```

## Database Schema

### Orders Table

```sql
CREATE TABLE orders (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP,
  updated_at TIMESTAMP,
  tiktok_nickname VARCHAR(255),
  telegram_id BIGINT,
  product_code VARCHAR(50),
  size VARCHAR(10),
  status VARCHAR(50),     -- pending, reserved, waiting_payment, paid, shipped, delivered, cancelled
  customer_name VARCHAR(255),
  phone VARCHAR(20),
  city VARCHAR(255),
  nova_poshta_branch VARCHAR(255),
  tracking_number VARCHAR(50),
  payment_confirmed_at TIMESTAMP,
  shipped_at TIMESTAMP
);
```

### Reservations Table

```sql
CREATE TABLE reservations (
  id SERIAL PRIMARY KEY,
  created_at TIMESTAMP,
  expires_at TIMESTAMP,   -- Auto-cleanup when passed
  tiktok_nickname VARCHAR(255),
  product_code VARCHAR(50),
  size VARCHAR(10),
  order_id INT REFERENCES orders(id)
);
```

## Telegram Bot Commands

### Customer Commands

```
/start                          → Welcome message
[Auto on reservation]           → Confirmation flow
```

### Admin Commands

```
/send_tracking <userId> <orderId> <trackingNumber>    → Send tracking to customer
```

## Configuration & Tuning

### Business Rules (in .env)

```bash
RESERVATION_TIMEOUT_MINUTES=5           # How long items are held
PAYMENT_CONFIRMATION_TIMEOUT_MINUTES=10 # Payment deadline
```

### Comment Rate Limiting

In `tiktok.ts`, adjust per-user rate limit:

```typescript
private commentRateLimit = 1000; // milliseconds between orders per user
```

### Spam Prevention

The system includes:
- Per-user rate limiting (prevent spam from same account)
- Comment format validation (regex matching)
- Length checks to avoid false positives
- Automatic reservation cleanup

## Logging

Logs are saved to `logs/` directory:

```bash
logs/
├── combined.log      # All logs
└── error.log         # Error logs only
```

Console output includes timestamps and structured data:

```
[2024-01-15 10:30:45] INFO: Order detected: A12 92
[2024-01-15 10:30:46] DEBUG: Reservation created, expires_at: 2024-01-15 10:35:46
[2024-01-15 10:31:02] WARN: Reconnecting in 5s... (attempt 1/10)
```

## Production Deployment

### VPS Deployment

```bash
# SSH into VPS
ssh user@vps.example.com

# Clone repo
git clone <repo> /opt/tiktok-live
cd /opt/tiktok-live

# Copy .env
cp .env.example .env
# Edit .env with production values
nano .env

# Build & run with Docker
docker-compose -f docker-compose.yml up -d

# View logs
docker-compose logs -f
```

### Environment (Production .env)

```bash
NODE_ENV=production
LOG_LEVEL=info
API_PORT=3000

# Use proper database credentials
DB_HOST=db.example.com
DB_USER=admin_user
DB_PASSWORD=<strong_password>

# Telegram
TELEGRAM_BOT_TOKEN=<prod_token>
TELEGRAM_CHANNEL_ID=<admin_channel_id>

# TikTok
TIKTOK_USERNAME=your_live_username
```

### SSL/HTTPS

Use nginx reverse proxy:

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;
    
    ssl_certificate /etc/ssl/certs/cert.pem;
    ssl_certificate_key /etc/ssl/private/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header X-Forwarded-For $remote_addr;
    }
}
```

### Database Backup

```bash
# Daily backup
0 2 * * * pg_dump tiktok_live | gzip > /backups/tiktok_live_$(date +\%Y\%m\%d).sql.gz

# Keep last 30 days
find /backups -name "tiktok_live_*.sql.gz" -mtime +30 -delete
```

## Monitoring & Alerts

### Health Check

```bash
curl http://localhost:3000/health

# Response
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:45.123Z",
  "tiktok": {
    "connected": true,
    "reconnectAttempts": 0
  }
}
```

### Recommended Monitoring

1. **Uptime monitoring**: Use uptimerobot.com or similar
2. **Log aggregation**: ELK Stack, Datadog, or similar
3. **Database monitoring**: pgAdmin, AWS RDS monitoring
4. **Telegram alerts**: Bot sends critical errors to admin channel

## Troubleshooting

### TikTok not connecting

```bash
# Check logs
docker-compose logs app | grep -i tiktok

# Verify username is correct
# Check if LIVE is actually active
```

### Database errors

```bash
# Check PostgreSQL is running
docker-compose ps postgres

# Check credentials
docker-compose logs postgres

# Manually connect
psql -h localhost -U postgres -d tiktok_live
```

### Telegram bot not responding

```bash
# Verify token is valid
curl "https://api.telegram.org/bot<TOKEN>/getMe"

# Check for rate limiting errors in logs
docker-compose logs app | grep -i telegram
```

### High memory usage

```bash
# Check for memory leaks
docker stats

# Restart app
docker-compose restart app
```

## Future Enhancements

- [ ] AI auto-replies to TikTok comments
- [ ] Inventory management & stock sync
- [ ] Admin web dashboard
- [ ] Analytics per LIVE session
- [ ] Automatic video clip generation
- [ ] AI FAQ assistant
- [ ] Multi-stream support
- [ ] CRM panel for customer history

## Contributing

1. Create feature branch: `git checkout -b feature/amazing-feature`
2. Commit: `git commit -m 'Add amazing feature'`
3. Push: `git push origin feature/amazing-feature`
4. Open Pull Request

## License

MIT License - see LICENSE file

## Support

For issues, questions, or feature requests:
1. Check existing issues on GitHub
2. Create detailed bug reports
3. Include logs and steps to reproduce

---

**Made with ❤️ for TikTok LIVE sellers**
