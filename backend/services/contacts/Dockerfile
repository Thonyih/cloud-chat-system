FROM node:22-alpine
WORKDIR /app

COPY contacts/package.json ./
RUN npm install --omit=dev

# Copy common metrics module
COPY common ./common

COPY contacts/src ./src
ENV NODE_ENV=production
EXPOSE 8083
CMD ["node","src/index.js"]
