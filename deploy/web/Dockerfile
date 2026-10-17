FROM node:22-alpine AS build
WORKDIR /app
COPY codegen/leave_approval/web/package.json codegen/leave_approval/web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY codegen/leave_approval/web/ ./
ARG VITE_API_BASE=""
ARG VITE_STS_URL="/api/v1/platform/oss/sts"
ENV VITE_API_BASE=$VITE_API_BASE VITE_STS_URL=$VITE_STS_URL
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
