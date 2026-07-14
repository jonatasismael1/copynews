FROM node:24-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY worker/package*.json ./
RUN npm install --omit=dev
COPY worker/src ./src
ENV NODE_ENV=production PORT=8080
CMD ["node","src/index.mjs"]
