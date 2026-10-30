FROM node:22-bookworm-slim
ADD https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /etc/ssl/rds/global-bundle.pem
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev --no-audit --no-fund && npm cache clean --force
COPY src/ ./src/
COPY sql/ ./sql/
RUN chmod 0644 /etc/ssl/rds/global-bundle.pem
USER node
EXPOSE 3000
CMD ["node", "src/bootstrap-server.mjs"]
