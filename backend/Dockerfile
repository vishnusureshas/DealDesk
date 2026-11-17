FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY dealdesk/package.json ./dealdesk/package.json
COPY billport/package.json ./billport/package.json
RUN npm ci

COPY . .
ARG SERVICE=dealdesk
RUN npm run build --workspace ${SERVICE}

WORKDIR /app/${SERVICE}
CMD ["node", "dist/server.js"]
