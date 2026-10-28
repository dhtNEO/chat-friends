FROM golang:1.27.3-alpine AS build
ARG GOPROXY=https://proxy.golang.org,direct
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,id=chat-friends-go-mod,target=/go/pkg/mod,sharing=locked --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then cp /run/secrets/build_ca /usr/local/share/ca-certificates/build.crt; update-ca-certificates; fi; \
    go mod download github.com/caddyserver/caddy/v2 github.com/caddy-dns/duckdns github.com/libdns/duckdns github.com/libdns/libdns
COPY provider*.go ./
COPY cmd ./cmd
RUN --mount=type=cache,id=chat-friends-go-mod,target=/go/pkg/mod,sharing=locked --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go test -mod=readonly -trimpath ./... && CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-w -s" -o /usr/bin/caddy ./cmd/caddy
FROM alpine:3.24.3
ENV XDG_CONFIG_HOME=/config XDG_DATA_HOME=/data
RUN mkdir -p /config/caddy /data/caddy
COPY --from=golang:1.27.3-alpine /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --chmod=0755 --from=build /usr/bin/caddy /usr/bin/caddy
COPY --chmod=0555 entrypoint.sh /usr/local/bin/duckdns-caddy
ENTRYPOINT ["/usr/local/bin/duckdns-caddy"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
