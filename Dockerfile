FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache sqlite libstdc++ \
  && apk add --no-cache --virtual .build-deps python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev \
  && apk del .build-deps
COPY . .
RUN mkdir -p data && chown -R node:node /app
USER node
EXPOSE 443
CMD ["node", "src/server.js"]
