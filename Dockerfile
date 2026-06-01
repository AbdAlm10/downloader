FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# تثبيت yt-dlp وقت البناء — Render لا يعتمد على تنزيل GitHub عند أول طلب
RUN mkdir -p .bin \
  && curl -fsSL "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp" -o .bin/yt-dlp \
  && chmod +x .bin/yt-dlp \
  && .bin/yt-dlp --version

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

EXPOSE 3000

CMD ["npm", "start"]
