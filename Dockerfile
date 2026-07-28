FROM mcr.microsoft.com/playwright:v1.48.0-jammy

WORKDIR /app

COPY . .

RUN npm ci --ignore-scripts

RUN apt-get update \
    && apt-get install -y --no-install-recommends fonts-noto-cjk fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

RUN npx playwright install --with-deps chromium
RUN npm run build

ENV NODE_ENV=production

CMD ["node", "dist/server.js"]
