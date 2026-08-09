FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (incl. dev for build)
RUN npm ci

# Copy source, migrations, landing page, upload placeholder
COPY src/ ./src/
COPY public/ ./public/
COPY migrations/ ./migrations/
RUN mkdir -p data/pos-uploads logs

# Build and drop devDependencies
RUN npm run build && npm prune --omit=dev

ENV NODE_ENV=production

EXPOSE 3000

# Railway injects PORT at runtime
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||process.env.API_PORT||3000; require('http').get('http://127.0.0.1:'+p+'/health', r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

# Apply LIVE schema (idempotent) + POS schema, then start API
CMD ["sh", "-c", "node dist/pos/migrate.js && node dist/index.js"]
