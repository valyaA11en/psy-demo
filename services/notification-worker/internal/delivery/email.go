package delivery

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"

	notificationconfig "notification-worker/internal/config"
	"notification-worker/internal/store"
)

type EmailSender interface {
	Send(ctx context.Context, notification *store.Notification) error
}

func newEmailSender(logger *slog.Logger, cfg notificationconfig.Config) (EmailSender, error) {
	switch cfg.EmailProvider {
	case "mock":
		return &mockEmailSender{
			logger: logger,
		}, nil
	case "smtp":
		return &smtpEmailSender{
			address:  fmt.Sprintf("%s:%d", cfg.SMTPHost, cfg.SMTPPort),
			host:     cfg.SMTPHost,
			from:     cfg.EmailFrom,
			username: cfg.SMTPUsername,
			password: cfg.SMTPPassword,
		}, nil
	default:
		return nil, fmt.Errorf("unsupported EMAIL_PROVIDER %s", cfg.EmailProvider)
	}
}

type mockEmailSender struct {
	logger *slog.Logger
}

func (s *mockEmailSender) Send(_ context.Context, notification *store.Notification) error {
	if notification.RecipientEmail == "" {
		return permanentError("email_recipient_missing", fmt.Errorf("recipient email is missing"))
	}

	s.logger.Info(
		"email delivery simulated",
		"notification_id", notification.ID,
		"user_id", notification.UserID,
		"type", notification.Type,
	)
	return nil
}

type smtpEmailSender struct {
	address  string
	host     string
	from     string
	username string
	password string
}

func (s *smtpEmailSender) Send(ctx context.Context, notification *store.Notification) error {
	if notification.RecipientEmail == "" {
		return permanentError("email_recipient_missing", fmt.Errorf("recipient email is missing"))
	}

	if err := ctx.Err(); err != nil {
		return retryableError("email_context_cancelled", err)
	}

	var auth smtp.Auth
	if s.username != "" {
		auth = smtp.PlainAuth("", s.username, s.password, s.host)
	}

	message := []byte(fmt.Sprintf(
		"To: %s\r\nSubject: %s\r\n\r\n%s",
		notification.RecipientEmail,
		notification.Title,
		notification.Body,
	))

	if err := smtp.SendMail(s.address, auth, s.from, []string{notification.RecipientEmail}, message); err != nil {
		return retryableError("smtp_send_failed", err)
	}

	return nil
}
