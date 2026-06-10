# Build stage
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage
FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV BIND_HOST=0.0.0.0
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/.out ./.out
COPY definitions.json ./
COPY instructions.md ./

# Mount your private key at runtime:
#   docker run -v /host/path/key.pem:/run/secrets/fhir-key.pem \
#     -e FHIR_PRIVATE_KEY=/run/secrets/fhir-key.pem ...
USER node
EXPOSE 5000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:5000/health || exit 1
CMD ["node", ".out/server.js"]
