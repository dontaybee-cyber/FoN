# Stage 1: Build
FROM node:22-slim AS builder

# Fix: Remove -h and install essential build tools correctly
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm
WORKDIR /app

COPY pnpm-lock.yaml package.json ./

# Clean install to resolve type conflicts
RUN pnpm install

COPY . .
RUN pnpm run build

# Stage 2: Runtime
FROM node:22-slim AS runner
WORKDIR /app
RUN npm install -g pnpm

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

RUN pnpm install --prod
EXPOSE 3000
CMD ["node", "dist/main.js"]
# ... (rest of Dockerfile stays the same)

# Limit Node to ~400MB so the OS has room, preventing the 512MB hard crash
CMD ["node", "--max-old-space-size=400", "dist/main.js"]