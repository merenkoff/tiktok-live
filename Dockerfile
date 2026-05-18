FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies (incl. dev for build)
RUN npm ci

# Copy source and landing page
COPY src/ ./src/
COPY public/ ./public/

# Build and drop devDependencies
RUN npm run build && npm prune --omit=dev

RUN mkdir -p logs

ENV NODE_ENV=production

EXPOSE 3000

# Railway injects PORT at runtime
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "const p=process.env.PORT||process.env.API_PORT||3000; require('http').get('http://127.0.0.1:'+p+'/health', r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"

CMD ["npm", "start"]
