package webhook

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"

	telegramconfig "telegram-link-webhook/internal/config"
	apiclient "telegram-link-webhook/internal/coreapi"
	telegrambot "telegram-link-webhook/internal/telegram"
)

type Server struct {
	logger    *slog.Logger
	config    telegramconfig.Config
	apiClient *apiclient.Client
	botClient *telegrambot.Client
}

type telegramUpdate struct {
	UpdateID int64            `json:"update_id"`
	Message  *telegramMessage `json:"message"`
}

type telegramMessage struct {
	MessageID int64         `json:"message_id"`
	Text      string        `json:"text"`
	Chat      telegramChat  `json:"chat"`
	From      *telegramUser `json:"from"`
}

type telegramChat struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type telegramUser struct {
	ID        int64  `json:"id"`
	Username  string `json:"username"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
}

func New(
	logger *slog.Logger,
	cfg telegramconfig.Config,
	apiClient *apiclient.Client,
	botClient *telegrambot.Client,
) *Server {
	return &Server{
		logger:    logger,
		config:    cfg,
		apiClient: apiClient,
		botClient: botClient,
	}
}

func (s *Server) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealth)
	mux.HandleFunc("/telegram/webhook", s.handleTelegramWebhook)
	return mux
}

func (s *Server) handleHealth(writer http.ResponseWriter, _ *http.Request) {
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte("ok"))
}

func (s *Server) handleTelegramWebhook(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodPost {
		http.NotFound(writer, request)
		return
	}

	if s.config.TelegramWebhookSecret != "" {
		if request.Header.Get("X-Telegram-Bot-Api-Secret-Token") != s.config.TelegramWebhookSecret {
			http.Error(writer, "forbidden", http.StatusForbidden)
			return
		}
	}

	var update telegramUpdate
	if err := json.NewDecoder(request.Body).Decode(&update); err != nil {
		http.Error(writer, "bad request", http.StatusBadRequest)
		return
	}

	go s.processUpdate(context.Background(), &update)

	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(`{"ok":true}`))
}

func (s *Server) processUpdate(ctx context.Context, update *telegramUpdate) {
	if update.Message == nil || update.Message.Chat.Type != "private" {
		return
	}

	token, ok := extractStartToken(update.Message.Text)
	if !ok {
		return
	}

	chatID := formatTelegramID(update.Message.Chat.ID)
	input := apiclient.ConsumeTelegramLinkInput{
		Token:  token,
		ChatID: chatID,
	}

	if update.Message.From != nil {
		input.TelegramUserID = formatTelegramID(update.Message.From.ID)
		input.Username = strings.TrimSpace(update.Message.From.Username)
		input.FirstName = strings.TrimSpace(update.Message.From.FirstName)
		input.LastName = strings.TrimSpace(update.Message.From.LastName)
	}

	linked, alreadyLinked, err := s.apiClient.ConsumeTelegramLink(ctx, input)
	if err != nil {
		s.logger.Warn("failed to consume telegram link token", "update_id", update.UpdateID, "chat_id", chatID, "error", err)
		_ = s.botClient.SendMessage(ctx, chatID, "Ссылка привязки недействительна или уже истекла. Сгенерируйте новую ссылку в личном кабинете.")
		return
	}

	if linked && alreadyLinked {
		_ = s.botClient.SendMessage(ctx, chatID, "Этот Telegram уже был успешно привязан к вашему аккаунту.")
		return
	}

	if linked {
		_ = s.botClient.SendMessage(ctx, chatID, "Telegram успешно подключён. Теперь уведомления платформы можно получать через этого бота.")
	}
}

func extractStartToken(text string) (string, bool) {
	value := strings.TrimSpace(text)
	if value == "" {
		return "", false
	}

	parts := strings.Fields(value)
	if len(parts) < 2 {
		return "", false
	}

	command := parts[0]
	if !strings.HasPrefix(command, "/start") {
		return "", false
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", false
	}

	return token, true
}

func formatTelegramID(value int64) string {
	return strconv.FormatInt(value, 10)
}
