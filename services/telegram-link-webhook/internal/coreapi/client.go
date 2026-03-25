package coreapi

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Client struct {
	baseURL       string
	webhookSecret string
	httpClient    *http.Client
}

type ConsumeTelegramLinkInput struct {
	Token          string `json:"token"`
	ChatID         string `json:"chatId"`
	TelegramUserID string `json:"telegramUserId,omitempty"`
	Username       string `json:"username,omitempty"`
	FirstName      string `json:"firstName,omitempty"`
	LastName       string `json:"lastName,omitempty"`
}

type consumeTelegramLinkResponse struct {
	Data struct {
		Linked        bool `json:"linked"`
		AlreadyLinked bool `json:"alreadyLinked"`
	} `json:"data"`
}

type errorEnvelope struct {
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func New(baseURL string, webhookSecret string) *Client {
	return &Client{
		baseURL:       strings.TrimRight(baseURL, "/"),
		webhookSecret: webhookSecret,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) ConsumeTelegramLink(ctx context.Context, input ConsumeTelegramLinkInput) (bool, bool, error) {
	body, err := json.Marshal(input)
	if err != nil {
		return false, false, fmt.Errorf("marshal consume request: %w", err)
	}

	request, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/internal/telegram-link/consume",
		bytes.NewReader(body),
	)
	if err != nil {
		return false, false, fmt.Errorf("build consume request: %w", err)
	}

	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("x-webhook-secret", c.webhookSecret)

	response, err := c.httpClient.Do(request)
	if err != nil {
		return false, false, fmt.Errorf("send consume request: %w", err)
	}
	defer response.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 4096))
	if err != nil {
		return false, false, fmt.Errorf("read consume response: %w", err)
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		var envelope errorEnvelope
		if err := json.Unmarshal(responseBody, &envelope); err == nil && envelope.Error != nil && envelope.Error.Message != "" {
			return false, false, fmt.Errorf("%s", envelope.Error.Message)
		}

		return false, false, fmt.Errorf("api-core returned status %d", response.StatusCode)
	}

	var envelope consumeTelegramLinkResponse
	if err := json.Unmarshal(responseBody, &envelope); err != nil {
		return false, false, fmt.Errorf("decode consume response: %w", err)
	}

	return envelope.Data.Linked, envelope.Data.AlreadyLinked, nil
}
