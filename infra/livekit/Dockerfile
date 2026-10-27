FROM golang:1.27.3-alpine AS build
ARG GOPROXY=https://proxy.golang.org,direct
WORKDIR /src
ADD --checksum=sha256:c8d9b7ba9d66c8b5f314a438c0c2493815e7e70085e37706b888cab3c4ab8f8d https://codeload.github.com/livekit/livekit/tar.gz/refs/tags/v1.13.11 /source.tar.gz
RUN tar -xzf /source.tar.gz --strip-components=1 -C /src && rm /source.tar.gz
# Only golang.org/x/net differs from upstream: compatible security patch 0.60.0.
COPY go.mod go.sum ./
RUN --mount=type=cache,id=chat-friends-go-mod,target=/go/pkg/mod,sharing=locked --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export SSL_CERT_FILE=/run/secrets/build_ca; fi; go mod download
RUN --mount=type=cache,id=chat-friends-go-mod,target=/go/pkg/mod,sharing=locked --mount=type=cache,target=/root/.cache/go-build CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-w -s" -o /usr/bin/livekit-server ./cmd/server
FROM livekit/livekit-server:v1.13.11
COPY --from=build /usr/bin/livekit-server /livekit-server
COPY --chmod=0555 entrypoint.sh /usr/local/bin/chat-livekit-entrypoint
ENTRYPOINT ["/usr/local/bin/chat-livekit-entrypoint"]
