FROM node:24-alpine

WORKDIR /workspace/apps/api

COPY apps/api/package.json apps/api/package-lock.json ./
RUN npm ci

COPY apps/api/ ./
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main"]
