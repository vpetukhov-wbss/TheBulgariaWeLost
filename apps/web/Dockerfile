FROM node:24-alpine AS build

WORKDIR /workspace/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci

COPY apps/web/ ./
COPY contracts/ /workspace/contracts/
RUN npm run build && sed \
    's|<title>България, която изгубихме</title>|<!--# block name="share_fallback" --><title>България, която изгубихме</title><meta name="robots" content="noindex,follow"><!--# endblock --><!--# include virtual="/__material-share/$share_slug/share-head" stub="share_fallback" -->|' \
    dist/bulgaria-web/browser/index.html > dist/bulgaria-web/browser/material.html

FROM nginx:1.28-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist/bulgaria-web/browser/ /usr/share/nginx/html/

EXPOSE 8080
