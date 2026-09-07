# Uses Microsoft's Playwright image so Chromium + all OS-level deps for
# headless scraping are already present — avoids a long, fragile apt-get
# dependency list for fonts/codecs/etc in a plain node:20 image.
FROM mcr.microsoft.com/playwright:v1.46.0-jammy

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production
EXPOSE 4000

# Default to the API server; override the command to `node src/jobs/worker.js`
# for the scraper worker service (see docker-compose in a full deployment,
# or run as two separate services on Render/EC2).
CMD ["node", "src/server.js"]
