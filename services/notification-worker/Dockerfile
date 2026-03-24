FROM golang:1.24-alpine AS build
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/notification-worker ./cmd/notification-worker

FROM alpine:3.21
RUN adduser -D -u 10001 appuser
USER appuser
COPY --from=build /out/notification-worker /usr/local/bin/notification-worker
ENTRYPOINT ["notification-worker"]
