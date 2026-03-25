package config

import (
	"fmt"
	"os"
)

type Config struct {
	Port                  string
	APICoreBaseURL        string
	WebhookSigningSecret  string
	TelegramBotToken      string
	TelegramWebhookSecret string
}

func Load() (Config, error) {
	cfg := Config{
		Port:                  envOrDefault("PORT", "4010"),
		APICoreBaseURL:        os.Getenv("API_CORE_INTERNAL_BASE_URL"),
		WebhookSigningSecret:  os.Getenv("WEBHOOK_SIGNING_SECRET"),
		TelegramBotToken:      os.Getenv("TELEGRAM_BOT_TOKEN"),
		TelegramWebhookSecret: os.Getenv("TELEGRAM_WEBHOOK_SECRET"),
	}

	if cfg.APICoreBaseURL == "" {
		return Config{}, fmt.Errorf("API_CORE_INTERNAL_BASE_URL is required")
	}

	if cfg.WebhookSigningSecret == "" {
		return Config{}, fmt.Errorf("WEBHOOK_SIGNING_SECRET is required")
	}

	if cfg.TelegramBotToken == "" {
		return Config{}, fmt.Errorf("TELEGRAM_BOT_TOKEN is required")
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
