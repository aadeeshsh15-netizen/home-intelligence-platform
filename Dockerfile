# syntax=docker/dockerfile:1

# Multi-stage production build for Home Intelligence Platform
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl mosquitto

# 1. Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma/
RUN npm ci

# 2. Build application
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npx esbuild prisma/seed.ts --bundle --platform=node --target=node22 --outfile=prisma/seed.js --external:@prisma/client --external:bcryptjs
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN npm run build

# 3. Production runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

RUN npm install -g prisma@6.4.1

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/mosquitto ./mosquitto

USER nextjs

EXPOSE 3000 1883

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/live || exit 1

CMD ["sh", "-c", "if [ -z \"$MQTT_BROKER_URL\" ] || echo \"$MQTT_BROKER_URL\" | grep -q 'localhost\\|127.0.0.1'; then mosquitto -c /app/mosquitto/config/mosquitto.conf -d 2>/dev/null || true; fi; node prisma/pre-deploy.js && node server.js"]
