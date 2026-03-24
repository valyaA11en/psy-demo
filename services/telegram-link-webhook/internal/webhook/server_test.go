package webhook

import "testing"

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
