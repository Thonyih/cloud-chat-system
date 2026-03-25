FROM node:22-alpine
WORKDIR /app

COPY groups/package.json ./
RUN npm install --omit=dev

# Copy common metrics module
COPY common ./common

COPY groups/src ./src
ENV NODE_ENV=production
EXPOSE 8085
CMD ["node","src/index.js"]
