# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
# Copy only manifests to leverage Docker layer caching
COPY package*.json ./
RUN npm ci --ignore-scripts

##
## 2) Build TypeScript -> dist
##
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY tsconfig.json ./
# Copy sources (make sure db/, routes/, etc. come along)
COPY src ./src
# Optional: copy migrations or any build-time assets you keep in the repo
# COPY migrations ./migrations
# COPY prisma ./prisma
RUN npm run build

##
## 3) Runtime image
##
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# Set the port your server listens on (adjust if your server uses a different one)
ENV PORT=3001

# Install only production deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# Bring compiled JS and any runtime assets
COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/migrations ./migrations

# If you have a health endpoint, Render can hit it; otherwise just expose
EXPOSE 3000

# Start your compiled server (adjust if your entrypoint differs)
CMD ["node", "dist/server.js"]
