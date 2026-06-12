FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
COPY apps/api/package.json ./apps/api/

RUN npm install --workspace=apps/api --ignore-scripts

COPY apps/api ./apps/api

WORKDIR /app/apps/api
RUN npm run build

EXPOSE 3001
CMD ["node", "dist/index.js"]
