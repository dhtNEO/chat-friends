FROM golang:1.27.3-alpine AS switcher
ARG GOPROXY=https://proxy.golang.org,direct
WORKDIR /src
ADD --checksum=sha256:cd9719b775dbfedae53923c9b0dc792b66d42c51e0b36652ed6f747fbadc0164 https://codeload.github.com/tianon/gosu/tar.gz/refs/tags/1.19 /source.tar.gz
RUN tar -xzf /source.tar.gz --strip-components=1 -C /src && rm /source.tar.gz
RUN --mount=type=cache,id=chat-friends-go-mod,target=/go/pkg/mod,sharing=locked --mount=type=secret,id=build_ca \
    if [ -f /run/secrets/build_ca ]; then export SSL_CERT_FILE=/run/secrets/build_ca; fi; \
    CGO_ENABLED=0 go build -mod=readonly -trimpath -ldflags="-w -s" -o /usr/bin/gosu .
FROM postgres:17.11-alpine
COPY --from=switcher /usr/bin/gosu /usr/local/bin/gosu
