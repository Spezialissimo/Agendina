# syntax=docker/dockerfile:1

FROM node:24-alpine AS build
RUN npm install -g pnpm@11.1.2
WORKDIR /src
# Dependencies are fetched from the lockfile alone, so this layer stays cached until it changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm fetch
COPY . .
RUN pnpm install --offline --frozen-lockfile
RUN pnpm build

FROM node:24-alpine
ARG AGENDINA_VERSION=0.0.0-dev
ENV NODE_ENV=production \
    AGENDINA_VERSION=${AGENDINA_VERSION} \
    AGENDINA_WEB_DIR=/app/web \
    AGENDINA_DATABASE_URL=sqlite:/data/agendina.db \
    PORT=3000
WORKDIR /app
COPY --from=build /src/apps/server/dist/ ./server/
COPY --from=build /src/apps/web/dist/ ./web/
RUN mkdir /data && chown node:node /data
VOLUME /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server/main.js"]
