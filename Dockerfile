FROM node:20-bookworm-slim

ENV DENO_INSTALL=/usr/local \
    YTDLP_PATH=/usr/local/bin/yt-dlp \
    YTDLP_NODE_PATH=/usr/local/bin/node \
    YTDLP_DENO_PATH=/usr/local/bin/deno

# unzip مطلوب لسكربت تثبيت Deno — بدون JS runtime يوتيوب يعرض الصورة فقط
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    unzip \
    python3 \
    python3-pip \
  && pip3 install --break-system-packages --no-cache-dir -U yt-dlp curl-cffi \
  && curl -fsSL https://deno.land/install.sh | sh \
  && /usr/local/bin/deno --version \
  && /usr/local/bin/yt-dlp --version \
  && test -x /usr/local/bin/node \
  && node -e "process.exit(0)" \
  && deno eval "Deno.exit(0)" \
  && rm -rf /var/lib/apt/lists/*

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
