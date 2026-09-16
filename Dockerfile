FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache sqlite libstdc++ \
  && apk add --no-cache --virtual .build-deps python3 make g++
COPY package*.json ./
RUN npm ci --omit=dev \
  && apk del .build-deps
COPY . .
ARG BUILD_REVISION=unknown
RUN printf '{"revision":"%s","builtAt":"%s"}\n' "$BUILD_REVISION" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > build-info.json \
  && mkdir -p data && chown -R node:node /app
USER node
EXPOSE 443
CMD ["node", "src/server.js"]
