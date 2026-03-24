package delivery

import (
	"testing"

	"notification-worker/internal/store"
)

func TestTelegramChatIDFromStringPayload(t *testing.T) {
	notification := &store.Notification{
		PayloadJSON: []byte(`{"telegramChatId":"123456"}`),
	}

	chatID, err := telegramChatID(notification)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if chatID != "123456" {
		t.Fatalf("expected chat id 123456, got %s", chatID)
	}
}

func TestTelegramChatIDFromPreference(t *testing.T) {
	notification := &store.Notification{
		TelegramChatID: "987654321",
		PayloadJSON:    []byte(`{"kind":"noop"}`),
	}

	chatID, err := telegramChatID(notification)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if chatID != "987654321" {
		t.Fatalf("expected chat id 987654321, got %s", chatID)
	}
}

func TestTelegramChatIDFromNumericPayload(t *testing.T) {
	notification := &store.Notification{
		PayloadJSON: []byte(`{"chatId":123456}`),
	}

	chatID, err := telegramChatID(notification)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if chatID != "123456" {
		t.Fatalf("expected chat id 123456, got %s", chatID)
	}
}

func TestTelegramChatIDMissing(t *testing.T) {
	notification := &store.Notification{
		PayloadJSON: []byte(`{"kind":"noop"}`),
	}

	if _, err := telegramChatID(notification); err == nil {
		t.Fatal("expected error for missing chat id")
	}
}
