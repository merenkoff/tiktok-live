# 🚀 Quick Start Guide - 5 Minutes to Running

## Step 1: Setup (2 minutes)

```bash
# Clone the project
git clone <repo> tiktok-live-automation
cd tiktok-live-automation

# Copy environment template
cp .env.example .env

# Get your secrets:
# 1. Telegram Bot Token from @BotFather on Telegram
# 2. Your TikTok username (must have LIVE enabled)
# 3. Nova Poshta API key (optional, sign up at developers.novaposhta.ua)

# Edit .env with your values
nano .env
```

## Step 2: Start Services (2 minutes)

### Option A: Docker (Recommended)

```bash
docker-compose up -d

# Wait ~30 seconds for services to start
sleep 30

# Check status
docker-compose ps

# Watch logs
docker-compose logs -f app
```

### Option B: Manual (if no Docker)

```bash
# Install dependencies
npm install

# Start PostgreSQL & Redis separately
# (use your existing instances or docker)

# Run migrations
npm run build

# Start the app
npm start
```

## Step 3: Test (1 minute)

```bash
# Check health
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "tiktok": { "connected": true, "reconnectAttempts": 0 }
# }

# Go live on TikTok and comment "A12 92"
# The system will:
# 1. Parse the order
# 2. Create a reservation
# 3. Send you a link to Telegram to complete the order
```

## Step 4: Complete First Order

1. **In TikTok LIVE**: Comment `A12 92` (or `хочу A12`)
2. **Check logs**: `docker-compose logs -f app | grep -i "order detected"`
3. **Open Telegram bot**: Click link in message
4. **Follow bot prompts**:
   - Enter name
   - Enter phone
   - Select city
   - Select delivery branch
5. **Admin confirmation**: You'll get a notification in your admin channel

## 📋 Checklist Before Going LIVE

- [ ] `.env` file filled with real credentials
- [ ] `docker-compose ps` shows all services as "Up"
- [ ] `curl http://localhost:3000/health` returns `"status":"ok"`
- [ ] TikTok account is set to LIVE
- [ ] Telegram bot is responding to `/start`
- [ ] At least one product code configured (e.g., A12, B07, K19)

## 🎯 What Happens Next

```
User comments "A12 92" in TikTok LIVE
                    ↓
System parses: Product=A12, Size=92
                    ↓
Creates 5-minute reservation
                    ↓
User opens Telegram link
                    ↓
Bot asks for: Name, Phone, City, Branch
                    ↓
Order created in database
                    ↓
Admin gets notification
                    ↓
Admin approves & generates tracking number
                    ↓
Customer gets tracking link
```

## 🐛 Troubleshooting

### "Can't connect to TikTok"
```bash
# Check:
1. TIKTOK_USERNAME is correct in .env
2. TikTok account is LIVE right now
3. Check logs: docker-compose logs app | grep -i tiktok
```

### "Telegram bot not responding"
```bash
# Test token:
curl "https://api.telegram.org/bot<YOUR_TOKEN>/getMe"

# Check logs:
docker-compose logs app | grep -i telegram
```

### "Database connection error"
```bash
# Restart database:
docker-compose restart postgres

# Check it's running:
docker-compose ps postgres
```

### "Port 3000 already in use"
```bash
# Change port in .env:
API_PORT=3001

# And rebuild:
docker-compose restart app
```

## 📊 Monitoring

### Real-time logs
```bash
docker-compose logs -f app
```

### Database viewer
```bash
# Connect to PostgreSQL
docker-compose exec postgres psql -U postgres -d tiktok_live

# See orders
SELECT id, tiktok_nickname, product_code, status FROM orders;

# Exit
\q
```

### Stats
```bash
# Current connections
docker-compose exec postgres psql -U postgres tiktok_live -c "SELECT count(*) FROM orders;"

# Pending orders
docker-compose exec postgres psql -U postgres tiktok_live -c "SELECT * FROM orders WHERE status='pending';"
```

## 🔧 Common Commands

```bash
# View logs
docker-compose logs app -f

# Rebuild after code changes
docker-compose up -d --build

# Stop everything
docker-compose down

# Reset database (⚠️ DELETES DATA!)
docker-compose down -v
docker-compose up -d

# Backup database
docker-compose exec postgres pg_dump -U postgres tiktok_live > backup.sql

# Restore from backup
docker-compose exec -T postgres psql -U postgres tiktok_live < backup.sql
```

## 📞 API for Testing

```bash
# Check availability of a product
curl "http://localhost:3000/api/availability/A12/92"

# Get orders for a user
curl "http://localhost:3000/api/orders/tiktok/your_tiktok_nickname"

# Admin: Get pending orders
curl "http://localhost:3000/api/admin/orders/pending"

# Admin: Cleanup expired reservations
curl -X POST "http://localhost:3000/api/admin/cleanup"
```

## 🎉 Next Steps

After getting one order working:

1. **Test multiple products**: A12, B07, K19, etc.
2. **Test in Russian**: "хочу A12", "беру B07"
3. **Set up Nova Poshta** (optional):
   - Get API key from developers.novaposhta.ua
   - Add to .env
   - System will auto-generate tracking numbers
4. **Deploy to production** (see DEPLOYMENT.md)

---

**Need help?** Check logs first: `docker-compose logs app | tail -50`

**Something broken?** Restart: `docker-compose restart app`
