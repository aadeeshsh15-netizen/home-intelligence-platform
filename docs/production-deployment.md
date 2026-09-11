# Production Deployment Guide

This document specifies the recommended single-node production deployment path for the Home Intelligence Platform using Docker Compose on Linux (Ubuntu 22.04 LTS / Debian 12).

---

## 1. Architecture Overview

The recommended production architecture utilizes a single host container stack fronted by an automatic TLS reverse proxy:

```
Internet / LAN ──> HTTPS (:443) ──> Caddy / Nginx (Let's Encrypt TLS)
                         │
                         ├──> HTTP (:3000) ──> Next.js 15 Standalone Server
                         │                            │
                         │                            ├──> PostgreSQL 16 Alpine (:5432)
                         │                            └──> Mosquitto 2 MQTT (:1883 / :8883)
                         │
Physical ESP32 ──> MQTTS (:8883) ─┘
```

---

## 2. Prerequisites & Server Sizing

- **Operating System**: Ubuntu 22.04 LTS x86_64 or Debian 12
- **Minimum Sizing**: 2 vCPU, 4 GB RAM, 20 GB SSD
- **Recommended Sizing**: 4 vCPU, 8 GB RAM, 50 GB NVMe SSD
- **Installed Software**: Docker Engine 24+ and Docker Compose v2.20+

---

## 3. Step-by-Step Deployment Procedure

### Step 1: Clone Repository & Create Release Directory
```bash
git clone https://github.com/aadeeshsh15-netizen/home-intelligence-platform.git /opt/home-intelligence
cd /opt/home-intelligence
git checkout v1.0.0
```

### Step 2: Configure Production Environment Variables
Create `/opt/home-intelligence/.env`:
```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Ensure the following variables are customized:
- `NODE_ENV="production"`
- `APP_SECRET`: Generate a secure 64-character random key (`openssl rand -hex 32`)
- `POSTGRES_PASSWORD`: Set a robust database password
- `DATABASE_URL="postgresql://postgres:${POSTGRES_PASSWORD}@postgres:5432/home_intelligence?schema=public"`
- `MQTT_BROKER_URL="mqtt://mosquitto:1883"`

### Step 3: Start Infrastructure & Application Stack
```bash
docker compose -f docker-compose.prod.yml up -d --build
```

### Step 4: Run Baseline Database Migrations & Seeding
Execute the reproducible bootstrap utility inside the running application container:
```bash
docker compose -f docker-compose.prod.yml exec app npm run bootstrap
```

### Step 5: Verify Health & Readiness Probes
```bash
curl -f http://localhost:3000/api/live
curl -f http://localhost:3000/api/ready
docker compose -f docker-compose.prod.yml exec app npm run check:readiness
```

---

## 4. Reverse Proxy & Domain TLS Setup (Caddy)

Configure `/etc/caddy/Caddyfile`:
```caddy
home.example.com {
    reverse_proxy localhost:3000

    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Content-Type-Options "nosniff"
        X-Frame-Options "DENY"
        Referrer-Policy "strict-origin-when-cross-origin"
    }
}
```
Restart Caddy:
```bash
sudo systemctl reload caddy
```

---

## 5. Maintenance, Updates, and Rollback Procedures

### Performing Rolling Updates (Zero-Downtime)
```bash
cd /opt/home-intelligence
git fetch --tags
git checkout v1.1.0
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d --no-deps app
docker compose -f docker-compose.prod.yml exec app npx prisma migrate deploy
```

### Deterministic Rollback Procedure
```bash
git checkout v1.0.0
docker compose -f docker-compose.prod.yml build app
docker compose -f docker-compose.prod.yml up -d --no-deps app
```

### Database Backup & Restore
- **Backup**:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U postgres home_intelligence > backup_$(date +%Y%m%d_%H%M%S).sql
  ```
- **Restore**:
  ```bash
  cat backup_20260912_000000.sql | docker compose -f docker-compose.prod.yml exec -T postgres psql -U postgres home_intelligence
  ```
