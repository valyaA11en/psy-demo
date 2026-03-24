package worker

import (
	"errors"
	"log/slog"
	"testing"
	"time"

	"notification-worker/internal/delivery"
)

func TestDeliveryFailureRetryable(t *testing.T) {
	processor := &Processor{
		logger:    slog.Default(),
		retryBase: time.Second,
		retryMax:  5 * time.Second,
	}

	code, nextAttemptAt := processor.deliveryFailure(1, &delivery.DeliveryError{
		Code:      "smtp_send_failed",
		Retryable: true,
		Err:       errors.New("temporary failure"),
	})

	if code != "smtp_send_failed" {
		t.Fatalf("expected error code smtp_send_failed, got %s", code)
	}

	if nextAttemptAt == nil {
		t.Fatal("expected nextAttemptAt for retryable delivery error")
	}
}

func TestDeliveryFailurePermanent(t *testing.T) {
	processor := &Processor{
		logger:    slog.Default(),
		retryBase: time.Second,
		retryMax:  5 * time.Second,
	}

	code, nextAttemptAt := processor.deliveryFailure(1, &delivery.DeliveryError{
		Code:      "telegram_chat_id_missing",
		Retryable: false,
		Err:       errors.New("chat id is missing"),
	})

	if code != "telegram_chat_id_missing" {
		t.Fatalf("expected error code telegram_chat_id_missing, got %s", code)
	}

	if nextAttemptAt != nil {
		t.Fatal("expected nil nextAttemptAt for permanent delivery error")
	}
}

func TestDeliveryFailureFallback(t *testing.T) {
	processor := &Processor{
		logger:    slog.Default(),
		retryBase: time.Second,
		retryMax:  5 * time.Second,
	}

	code, nextAttemptAt := processor.deliveryFailure(1, errors.New("unknown failure"))

	if code != "delivery_failed" {
		t.Fatalf("expected error code delivery_failed, got %s", code)
	}

	if nextAttemptAt == nil {
		t.Fatal("expected nextAttemptAt for generic error")
	}
}
