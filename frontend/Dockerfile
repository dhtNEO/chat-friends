FROM node:24.22.1-alpine AS build
WORKDIR /src
COPY frontend/package*.json ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/build_ca; fi; npm ci
COPY frontend/ .
RUN npm run build
FROM golang:1.27.3-alpine AS proxy
ARG GOPROXY=https://proxy.golang.org,direct
WORKDIR /src
COPY infra/caddy/go.mod infra/caddy/go.sum ./
RUN --mount=type=cache,id=chat-friends-go-mod,target=/go/pkg/mod,sharing=locked --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export SSL_CERT_FILE=/run/secrets/build_ca; fi; go mod download
COPY infra/caddy/provider*.go ./
COPY infra/caddy/cmd ./cmd
RUN --mount=type=cache,id=chat-friends-go-mod,target=/go/pkg/mod,sharing=locked --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-w -s" -o /usr/bin/caddy ./cmd/caddy
FROM alpine:3.24.3
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
RUN mkdir -p /config/caddy /data/caddy /etc/caddy
COPY --from=golang:1.27.3-alpine /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --chmod=0755 --from=proxy /usr/bin/caddy /usr/bin/caddy
COPY --from=build /src/dist /srv
COPY --chmod=0444 frontend/Caddyfile /etc/caddy/Caddyfile
RUN chmod 0555 /etc/caddy
ENTRYPOINT ["caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
