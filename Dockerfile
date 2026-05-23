# Build stage for frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# Build stage for backend
FROM golang:1.24-alpine AS backend-builder
RUN apk add --no-cache gcc musl-dev
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=1 GOOS=linux go build -o valenote ./cmd/server

# Production stage
FROM alpine:latest
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app

COPY --from=backend-builder /app/valenote .
COPY --from=frontend-builder /app/web/dist ./web/dist

ENV VALENOTE_PORT=8080
ENV VALENOTE_MODE=release
ENV VALENOTE_DATA_PATH=/data
ENV VALENOTE_NOTES_PATH=/notes

EXPOSE 8080

VOLUME ["/data", "/notes"]

CMD ["./valenote"]
