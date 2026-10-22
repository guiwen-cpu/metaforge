FROM node:22-alpine AS studio
WORKDIR /app
COPY platform/package.json platform/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY platform/ ./
RUN npm run build

FROM node:22-alpine AS demo
WORKDIR /app
COPY codegen/leave_approval/web/package.json codegen/leave_approval/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY codegen/leave_approval/web/ ./
ARG VITE_API_BASE=""
ARG VITE_STS_URL="/api/v1/platform/oss/sts"
ENV VITE_API_BASE=$VITE_API_BASE VITE_STS_URL=$VITE_STS_URL
RUN npm run build -- --base=/demo/

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=studio /app/dist /usr/share/nginx/html
COPY --from=demo /app/dist /usr/share/nginx/html/demo
EXPOSE 8080
