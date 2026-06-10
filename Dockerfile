# Single-image build for Coolify (or any container host).
# Stage 1 builds the Vite frontend (dist/) and bundles the server (server.mjs).
# Stage 2 is a tiny runtime that just runs the bundled server — no node_modules.

FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 3000
CMD ["node", "server.mjs"]
