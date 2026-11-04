FROM node:22-bookworm-slim@sha256:4b150b48b4116e2a22f2c39cc27025fbf4f153e2078fd3b14d159fdb5c7279da AS base
WORKDIR /srv/sporthost
ENV NEXT_TELEMETRY_DISABLED=1

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS builder
ENV NODE_OPTIONS=--max-old-space-size=1024
COPY --from=deps /srv/sporthost/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production APP_ENV=production HOSTNAME=0.0.0.0 PORT=3000
RUN groupadd --gid 10001 sporthost && useradd --uid 10001 --gid sporthost --no-create-home sporthost \
    && mkdir -p /data/uploads /srv/sporthost/.next && chown -R sporthost:sporthost /data/uploads /srv/sporthost
COPY --from=builder --chown=sporthost:sporthost /srv/sporthost/.next/standalone ./
COPY --from=builder --chown=sporthost:sporthost /srv/sporthost/.next/static ./.next/static
COPY --from=builder --chown=sporthost:sporthost /srv/sporthost/public ./public
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
# Schema changes are reviewed operator actions, never a web startup side effect.
CMD ["node", "server.js"]
