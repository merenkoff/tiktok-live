# admin/Dockerfile

# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (lockfile must stay in sync for npm ci)
RUN npm ci

# Copy source code
COPY . .

# Build the app (exclude tests from tsc via tsconfig)
RUN npm run build

# Stage 2: Runtime (serve)
FROM node:20-alpine

WORKDIR /app

# Install serve
RUN npm install -g serve

# Copy built app from builder
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 3001

# Set port env var
ENV PORT=3001

# Start the app
CMD ["serve", "-s", "dist", "-l", "3001"]
