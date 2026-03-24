package delivery

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	notificationconfig "notification-worker/internal/config"
	"notification-worker/internal/store"
)

type TelegramSender interface {
	Send(ctx context.Context, notification *store.Notification) error
}

func newTelegramSender(logger *slog.Logger, cfg notificationconfig.Config) (TelegramSender, error) {
	switch cfg.TelegramProvider {
	case "mock":
		return &mockTelegramSender{
			logger: logger,
		}, nil
	case "bot_api":
		return &telegramBotSender{
			client: &http.Client{
				Timeout: 10 * time.Second,
			},
			apiURL: fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", cfg.TelegramBotToken),
		}, nil
	default:
		return nil, fmt.Errorf("unsupported TELEGRAM_PROVIDER %s", cfg.TelegramProvider)
	}
}

type mockTelegramSender struct {
	logger *slog.Logger
}

func (s *mockTelegramSender) Send(_ context.Context, notification *store.Notification) error {
	if _, err := telegramChatID(notification); err != nil {
		return permanentError("telegram_chat_id_missing", err)
	}

	s.logger.Info(
		"telegram delivery simulated",
		"notification_id", notification.ID,
		"user_id", notification.UserID,
		"type", notification.Type,
	)
	return nil
}

type telegramBotSender struct {
	client *http.Client
	apiURL string
}

func (s *telegramBotSender) Send(ctx context.Context, notification *store.Notification) error {
	chatID, err := telegramChatID(notification)
	if err != nil {
		return permanentError("telegram_chat_id_missing", err)
	}

	body, err := json.Marshal(map[string]string{
		"chat_id": chatID,
		"text":    formatTelegramText(notification),
	})
	if err != nil {
		return permanentError("telegram_payload_invalid", err)
	}

	request, err := http.NewRequestWithContext(ctx, http.MethodPost, s.apiURL, bytes.NewReader(body))
	if err != nil {
		return retryableError("telegram_request_build_failed", err)
	}

	request.Header.Set("Content-Type", "application/json")

	response, err := s.client.Do(request)
	if err != nil {
		return retryableError("telegram_request_failed", err)
	}
	defer response.Body.Close()

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		responseBody, _ := io.ReadAll(io.LimitReader(response.Body, 512))
		message := strings.TrimSpace(string(responseBody))
		if message == "" {
			message = fmt.Sprintf("telegram api returned status %d", response.StatusCode)
		}

		if response.StatusCode == http.StatusTooManyRequests || response.StatusCode >= 500 {
			return retryableError("telegram_bad_status", fmt.Errorf("telegram api returned status %d: %s", response.StatusCode, message))
		}

		return permanentError("telegram_bad_status", fmt.Errorf("telegram api returned status %d: %s", response.StatusCode, message))
	}

	return nil
}

func telegramChatID(notification *store.Notification) (string, error) {
	if strings.TrimSpace(notification.TelegramChatID) != "" {
		return strings.TrimSpace(notification.TelegramChatID), nil
	}

	if len(notification.PayloadJSON) == 0 {
		return "", fmt.Errorf("telegram chat id is missing")
	}

	var payload map[string]any
	if err := json.Unmarshal(notification.PayloadJSON, &payload); err != nil {
		return "", fmt.Errorf("failed to parse telegram payload: %w", err)
	}

	for _, key := range []string{"telegramChatId", "chatId"} {
		if value, ok := payload[key]; ok {
			switch typed := value.(type) {
			case string:
				if strings.TrimSpace(typed) == "" {
					continue
				}
				return strings.TrimSpace(typed), nil
			case float64:
				return fmt.Sprintf("%.0f", typed), nil
			}
		}
	}

	return "", fmt.Errorf("telegram chat id is missing")
}

func formatTelegramText(notification *store.Notification) string {
	return strings.TrimSpace(notification.Title + "\n\n" + notification.Body)
}
