FROM node:current-alpine

WORKDIR /app

COPY package.json package-lock.json .

RUN npm ci

COPY src src

ENTRYPOINT ["node", "/app/src/main.mjs"]
