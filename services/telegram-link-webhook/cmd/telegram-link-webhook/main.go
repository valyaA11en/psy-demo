package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	telegramconfig "telegram-link-webhook/internal/config"
	apiclient "telegram-link-webhook/internal/coreapi"
	telegrambot "telegram-link-webhook/internal/telegram"
	webhookserver "telegram-link-webhook/internal/webhook"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := telegramconfig.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	apiClient := apiclient.New(cfg.APICoreBaseURL, cfg.WebhookSigningSecret)
	botClient := telegrambot.New(cfg.TelegramBotToken)
	handler := webhookserver.New(logger, cfg, apiClient, botClient)

	server := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           handler.Routes(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		logger.Info("telegram link webhook started", "port", cfg.Port)
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logger.Error("telegram webhook server failed", "error", err)
			os.Exit(1)
		}
	}()

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		logger.Error("telegram webhook shutdown failed", "error", err)
		os.Exit(1)
	}

	logger.Info("telegram link webhook stopped")
}
