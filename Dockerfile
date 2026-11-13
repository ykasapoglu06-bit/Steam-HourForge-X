FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build
RUN npm ci --omit=dev

FROM node:22-slim
RUN groupadd -r app && useradd -r -g app -m -d /home/app -s /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./
COPY ui/ ./ui/
RUN mkdir -p /app/data && chown -R app:app /app
VOLUME ["/app/data"]
USER app
ENV NODE_ENV=production
ENV DASHBOARD_HOST=0.0.0.0
EXPOSE 17321
ENTRYPOINT ["node", "dist/index.js"]
