package delivery

import (
	"context"
	"fmt"
	"log/slog"

	notificationconfig "notification-worker/internal/config"
	"notification-worker/internal/store"
)

type Dispatcher struct {
	emailSender    EmailSender
	telegramSender TelegramSender
}

func NewDispatcher(logger *slog.Logger, cfg notificationconfig.Config) (*Dispatcher, error) {
	emailSender, err := newEmailSender(logger, cfg)
	if err != nil {
		return nil, err
	}

	telegramSender, err := newTelegramSender(logger, cfg)
	if err != nil {
		return nil, err
	}

	return &Dispatcher{
		emailSender:    emailSender,
		telegramSender: telegramSender,
	}, nil
}

func (d *Dispatcher) Deliver(ctx context.Context, notification *store.Notification) error {
	switch notification.Channel {
	case "in_app":
		return nil
	case "email":
		return d.emailSender.Send(ctx, notification)
	case "telegram":
		return d.telegramSender.Send(ctx, notification)
	default:
		return permanentError("channel_unsupported", fmt.Errorf("unsupported delivery channel %s", notification.Channel))
	}
}
