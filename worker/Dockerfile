FROM node:24-bookworm-slim
ARG YT_DLP_VERSION=2026.07.04
ARG YT_DLP_SHA256=6bbb3d314cde4febe36e5fa1d55462e29c974f63444e707871834f6d8cc210ae
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates curl \
  && curl --fail --location --silent --show-error \
    "https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP_VERSION}/yt-dlp_linux" \
    --output /usr/local/bin/yt-dlp \
  && echo "${YT_DLP_SHA256}  /usr/local/bin/yt-dlp" | sha256sum --check --strict \
  && chmod 0755 /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/package*.json ./
RUN npm install --omit=dev
COPY worker/src ./src
ENV NODE_ENV=production PORT=8080
CMD ["node","src/index.mjs"]
