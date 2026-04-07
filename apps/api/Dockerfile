# Simple production Dockerfile for API
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app/apps/api

# Install all deps for build
COPY apps/api/package.json ./package.json
COPY tsconfig.base.json /app/tsconfig.base.json
RUN npm install --ignore-scripts --legacy-peer-deps && npm cache clean --force
COPY apps/api .
# Generate Prisma Client (no DB connection needed for generate)
RUN npx prisma generate --schema prisma/schema.prisma && npm run build

FROM node:20-alpine AS runner
RUN apk add --no-cache openssl
WORKDIR /app/apps/api

# Install runtime deps including Prisma CLI for migrate deploy
COPY apps/api/package.json ./package.json
RUN npm install --ignore-scripts --legacy-peer-deps && npm cache clean --force

# Copy built dist and generated Prisma client
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/api/prisma ./prisma
COPY tsconfig.base.json /app/tsconfig.base.json

EXPOSE 3001
ENV PORT=3001 NODE_ENV=production
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
