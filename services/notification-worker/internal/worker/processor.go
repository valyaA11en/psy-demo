package worker

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"notification-worker/internal/delivery"
	"notification-worker/internal/store"
)

type Processor struct {
	logger     *slog.Logger
	store      *store.Store
	dispatcher *delivery.Dispatcher
	retryBase  time.Duration
	retryMax   time.Duration
}

func NewProcessor(
	logger *slog.Logger,
	store *store.Store,
	dispatcher *delivery.Dispatcher,
	retryBase time.Duration,
	retryMax time.Duration,
) *Processor {
	return &Processor{
		logger:     logger,
		store:      store,
		dispatcher: dispatcher,
		retryBase:  retryBase,
		retryMax:   retryMax,
	}
}

func (p *Processor) Process(ctx context.Context, notificationID string, workerID int) {
	notification, err := p.store.ClaimNotification(ctx, notificationID)
	if err != nil {
		p.logger.Error("failed to claim notification", "worker", workerID, "notification_id", notificationID, "error", err)
		return
	}

	if notification == nil {
		return
	}

	if err := p.dispatcher.Deliver(ctx, notification); err != nil {
		code, nextAttemptAt := p.deliveryFailure(notification.Attempts, err)
		if markErr := p.store.MarkFailed(ctx, notification.ID, code, err.Error(), nextAttemptAt); markErr != nil {
			p.logger.Error("failed to mark notification as failed", "worker", workerID, "notification_id", notification.ID, "error", markErr)
			return
		}

		logArgs := []any{
			"worker", workerID,
			"notification_id", notification.ID,
			"channel", notification.Channel,
			"attempts", notification.Attempts,
			"error", err,
			"error_code", code,
		}
		if nextAttemptAt != nil {
			logArgs = append(logArgs, "next_attempt_at", nextAttemptAt.UTC().Format(time.RFC3339))
		}

		p.logger.Warn("notification delivery failed", logArgs...)
		return
	}

	if err := p.store.MarkSent(ctx, notification.ID); err != nil {
		p.logger.Error("failed to mark notification as sent", "worker", workerID, "notification_id", notification.ID, "error", err)
		return
	}

	p.logger.Info(
		"notification delivered",
		"worker", workerID,
		"notification_id", notification.ID,
		"user_id", notification.UserID,
		"type", notification.Type,
		"channel", notification.Channel,
	)
}

func (p *Processor) nextAttempt(attempt int) time.Time {
	if attempt < 1 {
		attempt = 1
	}

	delay := p.retryBase
	for idx := 1; idx < attempt; idx++ {
		delay *= 2
		if delay >= p.retryMax {
			delay = p.retryMax
			break
		}
	}

	return time.Now().UTC().Add(delay)
}

func (p *Processor) deliveryFailure(attempt int, err error) (string, *time.Time) {
	var deliveryErr *delivery.DeliveryError
	if errors.As(err, &deliveryErr) {
		if deliveryErr.Retryable {
			nextAttemptAt := p.nextAttempt(attempt)
			return deliveryErr.Code, &nextAttemptAt
		}

		return deliveryErr.Code, nil
	}

	nextAttemptAt := p.nextAttempt(attempt)
	return "delivery_failed", &nextAttemptAt
}
