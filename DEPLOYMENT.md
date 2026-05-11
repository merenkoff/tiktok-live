# Deployment Guide

## Pre-Deployment Checklist

- [ ] Database backups configured
- [ ] All environment variables set correctly
- [ ] Telegram bot token verified working
- [ ] TikTok username confirmed (live stream active when testing)
- [ ] Nova Poshta API key tested (if using shipping)
- [ ] SSL certificates obtained
- [ ] Firewall rules configured
- [ ] Monitoring/alerting set up

## Quick Deploy (Docker)

### 1. Prepare VPS

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker & Docker Compose
curl -fsSL https://get.docker.com | sudo sh
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker
```

### 2. Deploy Application

```bash
# Create directory
mkdir -p /opt/tiktok-live && cd /opt/tiktok-live

# Clone repository
git clone https://github.com/yourname/tiktok-live-automation .

# Copy and configure environment
cp .env.example .env
nano .env  # Edit with production values

# Build and start
docker-compose up -d

# Verify
docker-compose ps
docker-compose logs app -f
```

### 3. Setup Reverse Proxy (Nginx)

```bash
# Install nginx
sudo apt install nginx -y

# Create config
sudo tee /etc/nginx/sites-available/tiktok-live > /dev/null <<EOF
server {
    listen 80;
    server_name api.yourdomain.com;

    # Redirect to HTTPS
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    # SSL certificates (use Let's Encrypt)
    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options "DENY" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    # Proxy settings
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Timeouts for long polling
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Rate limiting
    limit_req_zone \$binary_remote_addr zone=api:10m rate=10r/s;
    location /api/ {
        limit_req zone=api burst=20 nodelay;
        proxy_pass http://localhost:3000;
    }
}
EOF

# Enable site
sudo ln -sf /etc/nginx/sites-available/tiktok-live /etc/nginx/sites-enabled/

# Setup SSL with Let's Encrypt
sudo apt install certbot python3-certbot-nginx -y
sudo certbot certonly --nginx -d api.yourdomain.com

# Test and start nginx
sudo nginx -t
sudo systemctl restart nginx
```

### 4. Setup Monitoring

```bash
# Monitor with systemd-watchdog
sudo tee /etc/systemd/system/tiktok-live.service > /dev/null <<EOF
[Unit]
Description=TikTok LIVE Automation
After=docker.service
Requires=docker.service

[Service]
Type=notify
WorkingDirectory=/opt/tiktok-live
ExecStart=/usr/local/bin/docker-compose up
ExecStop=/usr/local/bin/docker-compose down
Restart=always
RestartSec=10s
TimeoutStopSec=30s

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable tiktok-live.service
sudo systemctl start tiktok-live.service
```

### 5. Setup Backups

```bash
# Create backup script
sudo tee /usr/local/bin/backup-tiktok-live.sh > /dev/null <<'EOF'
#!/bin/bash

BACKUP_DIR="/backups/tiktok-live"
DATE=$(date +%Y%m%d_%H%M%S)
DB_NAME="tiktok_live"

mkdir -p $BACKUP_DIR

# Backup PostgreSQL
docker exec $(docker ps -q -f "name=postgres") pg_dump -U postgres $DB_NAME | \
    gzip > $BACKUP_DIR/db_${DATE}.sql.gz

# Keep only last 30 days
find $BACKUP_DIR -name "db_*.sql.gz" -mtime +30 -delete

echo "Backup completed: $BACKUP_DIR/db_${DATE}.sql.gz"
EOF

sudo chmod +x /usr/local/bin/backup-tiktok-live.sh

# Add to crontab (daily at 2 AM)
sudo tee -a /etc/crontab > /dev/null <<EOF
0 2 * * * root /usr/local/bin/backup-tiktok-live.sh
EOF
```

## Environment Variables (Production)

```bash
# TikTok
TIKTOK_USERNAME=your_tiktok_live_username

# Telegram
TELEGRAM_BOT_TOKEN=<production_token_from_botfather>
TELEGRAM_CHANNEL_ID=<admin_channel_for_alerts>

# Database (use strong passwords!)
DB_HOST=localhost
DB_PORT=5432
DB_NAME=tiktok_live
DB_USER=tiktok_admin
DB_PASSWORD=<generate_with_openssl_rand_base64_32>

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<generate_with_openssl_rand_base64_32>

# Nova Poshta
NOVAPOSHTA_API_KEY=<your_api_key>
NOVAPOSHTA_MERCHANT_NAME=<your_business_name>

# Server
API_PORT=3000
NODE_ENV=production
LOG_LEVEL=info

# Business Rules
RESERVATION_TIMEOUT_MINUTES=5
PAYMENT_CONFIRMATION_TIMEOUT_MINUTES=10
```

## Security Best Practices

### 1. Firewall Rules

```bash
# Only allow necessary ports
sudo ufw enable
sudo ufw allow 22/tcp      # SSH
sudo ufw allow 80/tcp      # HTTP (redirect to HTTPS)
sudo ufw allow 443/tcp     # HTTPS
sudo ufw allow 5432/tcp    # PostgreSQL (local only - restrict!)
sudo ufw allow 6379/tcp    # Redis (local only - restrict!)

# More restrictive
sudo ufw allow from 10.0.0.0/8 to any port 5432
sudo ufw allow from 10.0.0.0/8 to any port 6379
```

### 2. Database Security

```bash
# Create separate DB user with limited permissions
psql -U postgres

CREATE USER tiktok_admin WITH PASSWORD 'strong_password_here';
CREATE DATABASE tiktok_live OWNER tiktok_admin;

GRANT CONNECT ON DATABASE tiktok_live TO tiktok_admin;
GRANT USAGE ON SCHEMA public TO tiktok_admin;
GRANT CREATE ON SCHEMA public TO tiktok_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO tiktok_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO tiktok_admin;

# Restrict PostgreSQL to localhost
echo "listen_addresses = 'localhost'" >> /etc/postgresql/16/main/postgresql.conf
sudo service postgresql restart
```

### 3. Application Secrets

```bash
# Generate secure random values
openssl rand -base64 32  # For passwords
openssl rand -hex 32     # For API keys

# Store in .env (never commit!)
chmod 600 .env
```

### 4. Logs & Monitoring

```bash
# Watch for errors
tail -f /opt/tiktok-live/logs/error.log

# Monitor system resources
watch -n 1 'docker stats'

# Check SSL certificate expiry
certbot certificates
```

## Scaling Considerations

### Current Architecture
- Single app instance
- PostgreSQL connection pool
- Redis for future queue implementation

### To Handle Multiple Streams

```typescript
// Future: Support multiple TikTok usernames
const managers = [
  new TikTokLiveManager('username1'),
  new TikTokLiveManager('username2'),
  new TikTokLiveManager('username3'),
];

// All feed into same database
// Admin dashboard tracks orders across all streams
```

### To Add Queuing (BullMQ Ready)

```typescript
import { Queue, Worker } from 'bullmq';

const orderQueue = new Queue('orders', {
  connection: redis,
});

// Workers process orders asynchronously
const worker = new Worker('orders', async (job) => {
  await processOrder(job.data);
});
```

## Troubleshooting Deployment

### App won't start

```bash
# Check logs
docker-compose logs app

# Verify environment variables
docker-compose config | grep -A 20 "environment:"

# Check database connection
docker-compose exec app npm run typecheck
```

### High CPU usage

```bash
# Check which process
docker stats

# Check for infinite loops or memory leaks in logs
grep -i "error\|warn" logs/combined.log | tail -20
```

### Database disk usage

```bash
# Check table sizes
docker-compose exec postgres psql -U postgres tiktok_live -c "
  SELECT schemaname, tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# Vacuum and analyze
docker-compose exec postgres psql -U postgres tiktok_live -c "VACUUM ANALYZE;"
```

## Rollback Procedure

```bash
# If something breaks in production

# 1. Stop current version
docker-compose down

# 2. Go back to previous git commit
git checkout <previous_commit_hash>

# 3. Rebuild and start
docker-compose up -d

# 4. Verify
curl https://api.yourdomain.com/health
```

## Maintenance Tasks

### Weekly
- [ ] Check logs for errors
- [ ] Monitor disk usage
- [ ] Review pending orders

### Monthly
- [ ] Update dependencies: `npm update`
- [ ] Review and optimize slow queries
- [ ] Rotate access logs

### Quarterly
- [ ] Full security audit
- [ ] Test backup/restore procedure
- [ ] Review scaling needs

---

**Questions? Check logs in `/opt/tiktok-live/logs/` or reach out to support.**
