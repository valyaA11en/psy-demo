FROM golang:1.24-alpine AS build
WORKDIR /app

COPY go.mod ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/telegram-link-webhook ./cmd/telegram-link-webhook

FROM alpine:3.21
RUN adduser -D -u 10001 appuser
USER appuser
COPY --from=build /out/telegram-link-webhook /usr/local/bin/telegram-link-webhook
ENTRYPOINT ["telegram-link-webhook"]
