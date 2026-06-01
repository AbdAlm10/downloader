FROM node:20-bookworm-slim

# حزمة apt قديمة جداً (2023) — YouTube يفشل. نثبت أحدث yt-dlp عبر pip.
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    python3 \
    python3-pip \
  && pip3 install --break-system-packages --no-cache-dir -U "yt-dlp[default]" \
  && rm -rf /var/lib/apt/lists/* \
  && /usr/local/bin/yt-dlp --version

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

ENV YTDLP_PATH=/usr/local/bin/yt-dlp
RUN mkdir -p .bin && ln -sf "${YTDLP_PATH}" .bin/yt-dlp

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]
