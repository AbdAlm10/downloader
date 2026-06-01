FROM node:20-bookworm-slim

ENV DENO_INSTALL=/usr/local \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    YTDLP_NODE_PATH=/usr/local/bin/node \
    YTDLP_DENO_PATH=/usr/local/bin/deno

# Official binary = bundled EJS (pip + ejs:github fails on many hosts at runtime)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    unzip \
  && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux" \
    -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && /usr/local/bin/yt-dlp --version \
  && curl -fsSL https://deno.land/install.sh | sh \
  && /usr/local/bin/deno --version \
  && test -x /usr/local/bin/node \
  && rm -rf /var/lib/apt/lists/*

COPY config/yt-dlp.conf /etc/yt-dlp.conf

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NODE_OPTIONS="--max-old-space-size=460"
RUN npm run build

RUN mkdir -p .bin && ln -sf "${YTDLP_PATH}" .bin/yt-dlp

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]
