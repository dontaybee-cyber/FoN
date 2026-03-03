# Stage 1: Build
FROM node:20-slim AS builder

# Install pnpm for budget-friendly fast builds
RUN npm install -g pnpm

WORKDIR /app

# Copy lockfile and package.json first to leverage Docker caching
COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

# Copy the rest of the source
COPY . .

# Build the TypeScript code
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