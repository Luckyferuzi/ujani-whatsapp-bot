# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts


FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules

COPY package*.json ./
COPY tsconfig.json tsconfig.build.json ./

COPY src ./src

RUN npm run build


FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001

# install only prod deps
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts

# copy compiled app
COPY --from=builder /app/dist ./dist
# COPY --from=builder /app/migrations ./migrations

EXPOSE 3001
CMD ["node","dist/server.js"]
