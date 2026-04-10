 FROM node:20-alpine AS deps
  WORKDIR /app
  COPY package.json package-lock.json ./
  COPY apps/web/package.json ./apps/web/package.json
  RUN npm ci

  FROM node:20-alpine AS build
  WORKDIR /app
  COPY --from=deps /app/node_modules ./node_modules
  COPY package.json package-lock.json ./
  COPY apps/web ./apps/web
  RUN npm --workspace=apps/web run build

  FROM node:20-alpine AS runner
  WORKDIR /app
  ENV NODE_ENV=production
  COPY --from=deps /app/node_modules ./node_modules
  COPY package.json package-lock.json ./
  COPY apps/web ./apps/web
  COPY --from=build /app/apps/web/dist ./apps/web/dist
  EXPOSE 5173
  CMD ["npm", "--workspace=apps/web", "run", "start", "--", "--host", "0.0.0.0", "--port", "5173"]

