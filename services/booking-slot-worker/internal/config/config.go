package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL      string
	RedisURL         string
	QueueKey         string
	Concurrency      int
	SweepInterval    time.Duration
	SweepBatchSize   int
	PopTimeout       time.Duration
	LookaheadDays    int
	CleanupBatchSize int
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:      os.Getenv("DATABASE_URL"),
		RedisURL:         os.Getenv("REDIS_URL"),
		QueueKey:         envOrDefault("BOOKING_SLOT_QUEUE_KEY", "consultations.booking-slots.v1"),
		Concurrency:      intOrDefault("BOOKING_SLOT_WORKER_CONCURRENCY", 4),
		SweepInterval:    secondsEnvOrDefault("BOOKING_SLOT_SWEEP_INTERVAL_SEC", 60),
		SweepBatchSize:   intOrDefault("BOOKING_SLOT_SWEEP_BATCH_SIZE", 100),
		PopTimeout:       secondsEnvOrDefault("BOOKING_SLOT_POP_TIMEOUT_SEC", 5),
		LookaheadDays:    intOrDefault("BOOKING_SLOT_LOOKAHEAD_DAYS", 21),
		CleanupBatchSize: intOrDefault("BOOKING_SLOT_CLEANUP_BATCH_SIZE", 200),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	if cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required")
	}

	if cfg.Concurrency < 1 {
		return Config{}, fmt.Errorf("BOOKING_SLOT_WORKER_CONCURRENCY must be greater than zero")
	}

	if cfg.SweepBatchSize < 1 {
		return Config{}, fmt.Errorf("BOOKING_SLOT_SWEEP_BATCH_SIZE must be greater than zero")
	}

	if cfg.LookaheadDays < 1 {
		return Config{}, fmt.Errorf("BOOKING_SLOT_LOOKAHEAD_DAYS must be greater than zero")
	}

	if cfg.CleanupBatchSize < 1 {
		return Config{}, fmt.Errorf("BOOKING_SLOT_CLEANUP_BATCH_SIZE must be greater than zero")
	}

	return cfg, nil
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}

func intOrDefault(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}

	return parsed
}

func secondsEnvOrDefault(key string, fallback int) time.Duration {
	return time.Duration(intOrDefault(key, fallback)) * time.Second
}
