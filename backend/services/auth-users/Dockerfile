FROM node:22-alpine
WORKDIR /app

# Copy dependency manifests first for better cache reuse
# Copy package manifest only (package-lock.json may not exist in the repo)
COPY auth-users/package.json ./

# Install only production deps (smaller image). Use --omit=dev with modern npm.
# Use `npm install` here so the build doesn't require a package-lock.json.
RUN npm install --omit=dev

# Copy common metrics module
COPY common ./common

# Copy app source
COPY auth-users/src ./src

ENV NODE_ENV=production
EXPOSE 8081
CMD ["node", "src/index.js"]