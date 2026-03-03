# Stage 1: Build
FROM node:22-slim AS builder  <-- Updated to 22

RUN npm install -g pnpm

WORKDIR /app

COPY pnpm-lock.yaml package.json ./

# Approve builds so esbuild can compile the TS code
RUN pnpm install --frozen-lockfile && pnpm approve-builds 

COPY . .

RUN pnpm run build

# Stage 2: Runtime
FROM node:20-slim AS runner

WORKDIR /app
RUN npm install -g pnpm

# Copy only the necessary files from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/pnpm-lock.yaml ./pnpm-lock.yaml

# Install only production dependencies
RUN pnpm install --prod --frozen-lockfile

# Expose the Dashboard port
EXPOSE 3000

# Set environment to production
ENV NODE_ENV=production

# Start the agent
CMD ["node", "dist/main.js"]