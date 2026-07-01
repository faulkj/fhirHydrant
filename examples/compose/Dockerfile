FROM node:24-alpine
ENV NODE_ENV=production
ENV MCP_TRANSPORT=http
ENV BIND_HOST=0.0.0.0
RUN npm install -g fhirhydrant
WORKDIR /app
# This example ships a MINIMAL resource catalog. The ./config overlay merges with
# (shadows/adds to) the packaged defaults per-file — it cannot REMOVE defaults —
# so to expose only the two resources below, wipe the packaged resources/ folder
# so nothing is left to fall back to. Non-resource files still overlay normally.
RUN rm -rf /usr/local/lib/node_modules/fhirhydrant/config/resources
COPY config/ /app/config/
USER node
EXPOSE 5000
HEALTHCHECK CMD wget -qO- http://127.0.0.1:5000/health || exit 1
CMD ["fhirhydrant"]
