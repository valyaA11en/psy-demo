package config

import (
	"fmt"
	"os"
	"strconv"
	"time"
)

type Config struct {
	DatabaseURL       string
	RedisURL          string
	QueueKey          string
	Concurrency       int
	SweepInterval     time.Duration
	SweepBatchSize    int
	PopTimeout        time.Duration
	RetryBase         time.Duration
	RetryMax          time.Duration
	ProcessingTimeout time.Duration
	EmailProvider     string
	EmailFrom         string
	SMTPHost          string
	SMTPPort          int
	SMTPUsername      string
	SMTPPassword      string
	TelegramProvider  string
	TelegramBotToken  string
}

func Load() (Config, error) {
	cfg := Config{
		DatabaseURL:       os.Getenv("DATABASE_URL"),
		RedisURL:          os.Getenv("REDIS_URL"),
		QueueKey:          envOrDefault("NOTIFICATION_QUEUE_KEY", "consultations.notifications.v1"),
		Concurrency:       intOrDefault("NOTIFICATION_WORKER_CONCURRENCY", 4),
		SweepInterval:     secondsEnvOrDefault("NOTIFICATION_SWEEP_INTERVAL_SEC", 30),
		SweepBatchSize:    intOrDefault("NOTIFICATION_SWEEP_BATCH_SIZE", 100),
		PopTimeout:        secondsEnvOrDefault("NOTIFICATION_POP_TIMEOUT_SEC", 5),
		RetryBase:         secondsEnvOrDefault("NOTIFICATION_RETRY_BASE_SEC", 15),
		RetryMax:          secondsEnvOrDefault("NOTIFICATION_RETRY_MAX_SEC", 900),
		ProcessingTimeout: secondsEnvOrDefault("NOTIFICATION_PROCESSING_TIMEOUT_SEC", 300),
		EmailProvider:     envOrDefault("EMAIL_PROVIDER", "mock"),
		EmailFrom:         envOrDefault("EMAIL_FROM", "no-reply@example.test"),
		SMTPHost:          os.Getenv("SMTP_HOST"),
		SMTPPort:          intOrDefault("SMTP_PORT", 587),
		SMTPUsername:      os.Getenv("SMTP_USERNAME"),
		SMTPPassword:      os.Getenv("SMTP_PASSWORD"),
		TelegramProvider:  envOrDefault("TELEGRAM_PROVIDER", "mock"),
		TelegramBotToken:  os.Getenv("TELEGRAM_BOT_TOKEN"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}

	if cfg.RedisURL == "" {
		return Config{}, fmt.Errorf("REDIS_URL is required")
	}

	if cfg.Concurrency < 1 {
		return Config{}, fmt.Errorf("NOTIFICATION_WORKER_CONCURRENCY must be greater than zero")
	}

	if cfg.SweepBatchSize < 1 {
		return Config{}, fmt.Errorf("NOTIFICATION_SWEEP_BATCH_SIZE must be greater than zero")
	}

	if cfg.EmailProvider == "smtp" {
		if cfg.SMTPHost == "" {
			return Config{}, fmt.Errorf("SMTP_HOST is required when EMAIL_PROVIDER=smtp")
		}

		if cfg.EmailFrom == "" {
			return Config{}, fmt.Errorf("EMAIL_FROM is required when EMAIL_PROVIDER=smtp")
		}
	}

	if cfg.TelegramProvider == "bot_api" && cfg.TelegramBotToken == "" {
		return Config{}, fmt.Errorf("TELEGRAM_BOT_TOKEN is required when TELEGRAM_PROVIDER=bot_api")
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
