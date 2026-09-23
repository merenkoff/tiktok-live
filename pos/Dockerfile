# pos/Dockerfile — static POS UI (same pattern as admin/)

FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
# VITE_API_BASE = public URL of the API service, e.g. https://xxx.up.railway.app
# Leave empty only if POS is reverse-proxied on the same origin as the API.
ARG VITE_API_BASE=
ENV VITE_API_BASE=$VITE_API_BASE
RUN npm run build

FROM node:20-alpine

WORKDIR /app
RUN npm install -g serve@14

COPY --from=builder /app/dist ./dist

EXPOSE 3002
ENV PORT=3002

# No `-s`: it would PREPEND `** -> /index.html` to the rewrites, and the first
# matching rule wins, so `/tablet/*` would never reach `tablet.html`. The SPA
# fallback is the LAST rule of `dist/serve.json` (copied in by
# `scripts/assemble-web-dist.mjs`), together with the cache headers the tablet
# PWA needs (TechDocs/POS_PWA.md §3).
CMD ["serve", "dist", "-l", "3002"]
