FROM golang:1.24-alpine AS build
WORKDIR /app

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/booking-slot-worker ./cmd/booking-slot-worker

FROM alpine:3.21
RUN adduser -D -u 10001 appuser
USER appuser
COPY --from=build /out/booking-slot-worker /usr/local/bin/booking-slot-worker
ENTRYPOINT ["booking-slot-worker"]
