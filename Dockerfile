# For hosts that run containers (Koyeb, Fly.io, Railway, Google Cloud Run, a VPS with Docker…)
FROM node:22-alpine
WORKDIR /app
COPY relay_server.js package.json ./
COPY capsid_wasteland_v*.html ./
ENV PORT=8787
EXPOSE 8787
USER node
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:${PORT}/health || exit 1
CMD ["node", "relay_server.js"]
