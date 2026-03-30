package webhook

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	telegramconfig "telegram-link-webhook/internal/config"
)

func TestExtractStartToken(t *testing.T) {
	token, ok := extractStartToken("/start abc123")
	if !ok {
		t.Fatal("expected token to be extracted")
	}

	if token != "abc123" {
		t.Fatalf("expected token abc123, got %s", token)
	}
}

func TestExtractStartTokenWithBotMention(t *testing.T) {
	token, ok := extractStartToken("/start@test_bot abc123")
	if !ok {
		t.Fatal("expected token to be extracted")
	}

	if token != "abc123" {
		t.Fatalf("expected token abc123, got %s", token)
	}
}

func TestExtractStartTokenMissing(t *testing.T) {
	if _, ok := extractStartToken("/start"); ok {
		t.Fatal("expected missing token to fail")
	}
}

func TestHandleTelegramWebhookRejectsWrongMethod(t *testing.T) {
	server := New(slog.Default(), telegramconfig.Config{}, nil, nil)
	request := httptest.NewRequest(http.MethodGet, "/telegram/webhook", nil)
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("expected 404 for wrong method, got %d", recorder.Code)
	}
}

func TestHandleTelegramWebhookRejectsWrongSecret(t *testing.T) {
	server := New(slog.Default(), telegramconfig.Config{
		TelegramWebhookSecret: "expected-secret",
	}, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/telegram/webhook", strings.NewReader(`{}`))
	request.Header.Set("X-Telegram-Bot-Api-Secret-Token", "wrong-secret")
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusForbidden {
		t.Fatalf("expected 403 for wrong secret, got %d", recorder.Code)
	}
}

func TestHandleTelegramWebhookRejectsBadJSON(t *testing.T) {
	server := New(slog.Default(), telegramconfig.Config{}, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/telegram/webhook", strings.NewReader(`{bad-json`))
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad json, got %d", recorder.Code)
	}
}

func TestHandleTelegramWebhookAcceptsIrrelevantUpdate(t *testing.T) {
	server := New(slog.Default(), telegramconfig.Config{}, nil, nil)
	request := httptest.NewRequest(http.MethodPost, "/telegram/webhook", strings.NewReader(`{"update_id":1,"message":{"message_id":1,"text":"hello","chat":{"id":42,"type":"private"}}}`))
	recorder := httptest.NewRecorder()

	server.Routes().ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("expected 200 for accepted update, got %d", recorder.Code)
	}

	if body := strings.TrimSpace(recorder.Body.String()); body != `{"ok":true}` {
		t.Fatalf("expected ok response body, got %s", body)
	}
}
