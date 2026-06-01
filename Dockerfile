FROM node:20-bookworm-slim

# yt-dlp حديث + Deno/Node لـ YouTube (بدون JS runtime تظهر الصور المصغّرة فقط)
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    ffmpeg \
    ca-certificates \
    curl \
    python3 \
    python3-pip \
  && pip3 install --break-system-packages --no-cache-dir -U yt-dlp curl-cffi \
  && rm -rf /var/lib/apt/lists/* \
  && /usr/local/bin/yt-dlp --version

ENV DENO_INSTALL=/usr/local
RUN curl -fsSL https://deno.land/install.sh | sh \
  && /usr/local/bin/deno --version

ENV YTDLP_PATH=/usr/local/bin/yt-dlp \
    YTDLP_NODE_PATH=/usr/local/bin/node \
    YTDLP_DENO_PATH=/usr/local/bin/deno

# فشل البناء إن لم يُستخرج فيديو من يوتيوب (يكشف غياب JS runtime مبكراً)
RUN yt-dlp -J --no-playlist \
    --js-runtimes "deno:/usr/local/bin/deno,node:/usr/local/bin/node" \
    "https://www.youtube.com/watch?v=jNQXAC9IVRw" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); v=[f for f in d.get('formats',[]) if (f.get('vcodec') or 'none')!='none']; assert len(v)>0, 'YouTube: no video formats (check Deno/Node)'"

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
