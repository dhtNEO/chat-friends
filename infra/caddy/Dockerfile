FROM caddy:2.11.4-builder AS build
ARG GOPROXY=https://proxy.golang.org,direct
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then cp /run/secrets/build_ca /usr/local/share/ca-certificates/build.crt; update-ca-certificates; fi; \
    go mod download github.com/caddyserver/caddy/v2 github.com/caddy-dns/duckdns github.com/libdns/duckdns github.com/libdns/libdns
COPY provider*.go ./
COPY cmd ./cmd
RUN --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 go test -mod=readonly -trimpath ./... && CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-w -s" -o /usr/bin/caddy ./cmd/caddy
FROM caddy:2.11.4-alpine
COPY --from=build /usr/bin/caddy /usr/bin/caddy
COPY entrypoint.sh /usr/local/bin/duckdns-caddy
ENTRYPOINT ["/usr/local/bin/duckdns-caddy"]
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
