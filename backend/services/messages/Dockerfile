FROM node:22-alpine
WORKDIR /app

COPY messages/package.json ./
RUN npm install --omit=dev

# Copy common metrics module
COPY common ./common

COPY messages/src ./src
ENV NODE_ENV=production
EXPOSE 8084
CMD ["node","src/index.js"]
