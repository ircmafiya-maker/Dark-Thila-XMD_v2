FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    ffmpeg \
    unzip \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

RUN npm install -g pnpm@10

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./

COPY pnpm-workspace.yaml ./pnpm-workspace.yaml

COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/dark-thila-bot/package.json ./artifacts/dark-thila-bot/

COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/

RUN pnpm install --no-frozen-lockfile --config.minimumReleaseAge=0

COPY . .

ENV NODE_ENV=production
ENV BASE_PATH=/
ENV PORT=18098

RUN pnpm --filter @workspace/api-server run build

RUN pnpm --filter @workspace/dark-thila-bot run build

RUN mkdir -p /app/artifacts/api-server/sessions

EXPOSE 8080

ENV PORT=8080

CMD ["node", "--enable-source-maps", "--max-old-space-size=350", "./artifacts/api-server/dist/index.mjs"]
