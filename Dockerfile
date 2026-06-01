FROM node:20-bookworm-slim

# yt-dlp من مستودع Debian — أسرع وأخف من pip (أنسب لـ Railway و Render)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    yt-dlp \
  && rm -rf /var/lib/apt/lists/* \
  && yt-dlp --version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV YTDLP_PATH=/usr/bin/yt-dlp
RUN mkdir -p .bin && ln -sf "${YTDLP_PATH}" .bin/yt-dlp

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]
