FROM node:24-alpine AS build

WORKDIR /workspace/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web/ ./
COPY contracts/ /workspace/contracts/
RUN npm run build

FROM nginx:1.28-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist/bulgaria-web/browser/ /usr/share/nginx/html/

EXPOSE 8080
