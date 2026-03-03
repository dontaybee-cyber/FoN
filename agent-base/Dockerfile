# Stage 1: Build
FROM node:22-slim AS builder

# Add build tools for better-sqlite3
RUN apt-get update && apt-get install -h && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-lock.yaml package.json ./

# Install EVERYTHING and approve the better-sqlite3 build
RUN pnpm install && pnpm approve-builds

COPY . .

RUN pnpm run build

# Stage 2: Runtime
FROM node:22-slim AS runner

WORKDIR /app
RUN npm install -g pnpm

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install only production dependencies
RUN pnpm install --prod

EXPOSE 3000
ENV NODE_ENV=production

# Start the agent
CMD ["node", "dist/main.js"]