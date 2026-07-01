FROM node:24-alpine
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV BIND_HOST=0.0.0.0
ENV PORT=8080
RUN npm install -g fhirhydrant
WORKDIR /app
# Partial overlay: files here override the packaged defaults per-file; anything
# omitted falls back to the built-in defaults. The server resolves ./config first.
COPY config/ /app/config/
USER node
EXPOSE 8080
HEALTHCHECK CMD wget -qO- http://127.0.0.1:8080/health || exit 1
CMD ["fhirhydrant"]
