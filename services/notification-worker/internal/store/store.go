package store

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Notification struct {
	ID             string
	UserID         string
	Channel        string
	Type           string
	Title          string
	Body           string
	Attempts       int
	RecipientEmail string
	TelegramChatID string
	PayloadJSON    []byte
}

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) DueNotificationIDs(ctx context.Context, limit int) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT id
		FROM notifications
		WHERE (
			status = 'queued'
			AND (next_attempt_at IS NULL OR next_attempt_at <= NOW())
		) OR (
			status = 'failed'
			AND next_attempt_at IS NOT NULL
			AND next_attempt_at <= NOW()
		)
		ORDER BY created_at ASC
		LIMIT $1
	`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	ids := make([]string, 0, limit)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}

		ids = append(ids, id)
	}

	return ids, rows.Err()
}

func (s *Store) RecoverStaleProcessing(
	ctx context.Context,
	processingTimeout time.Duration,
	limit int,
) (int64, error) {
	commandTag, err := s.db.Exec(ctx, `
		WITH stale AS (
			SELECT id
			FROM notifications
			WHERE status = 'processing'
			  AND processing_started_at IS NOT NULL
			  AND processing_started_at <= NOW() - ($1 * INTERVAL '1 second')
			ORDER BY processing_started_at ASC
			LIMIT $2
		)
		UPDATE notifications AS notifications
		SET status = 'failed',
		    failed_at = NOW(),
		    processing_started_at = NULL,
		    next_attempt_at = NOW(),
		    last_error_code = 'worker_timeout',
		    last_error_message = 'Notification processing timeout exceeded',
		    updated_at = NOW()
		FROM stale
		WHERE notifications.id = stale.id
	`, int(processingTimeout.Seconds()), limit)
	if err != nil {
		return 0, err
	}

	return commandTag.RowsAffected(), nil
}

func (s *Store) ClaimNotification(ctx context.Context, notificationID string) (*Notification, error) {
	row := s.db.QueryRow(ctx, `
		WITH claimed AS (
			UPDATE notifications
			SET status = 'processing',
			    processing_started_at = NOW(),
			    attempts = attempts + 1,
			    last_error_code = NULL,
			    last_error_message = NULL,
			    updated_at = NOW()
		WHERE id = $1
		  AND (
			(status = 'queued' AND (next_attempt_at IS NULL OR next_attempt_at <= NOW()))
			OR (status = 'failed' AND next_attempt_at IS NOT NULL AND next_attempt_at <= NOW())
		  )
		RETURNING id, user_id, channel::text, type, title, body, attempts, payload_json
		)
		SELECT claimed.id,
		       claimed.user_id,
		       claimed.channel,
		       claimed.type,
		       claimed.title,
		       claimed.body,
		       claimed.attempts,
		       users.email,
		       notification_preferences.telegram_chat_id,
		       claimed.payload_json
		FROM claimed
		JOIN users ON users.id = claimed.user_id
		LEFT JOIN notification_preferences
		  ON notification_preferences.user_id = claimed.user_id
	`, notificationID)

	var notification Notification
	var telegramChatID *string
	if err := row.Scan(
		&notification.ID,
		&notification.UserID,
		&notification.Channel,
		&notification.Type,
		&notification.Title,
		&notification.Body,
		&notification.Attempts,
		&notification.RecipientEmail,
		&telegramChatID,
		&notification.PayloadJSON,
	); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}

		return nil, err
	}

	if telegramChatID != nil {
		notification.TelegramChatID = *telegramChatID
	}

	return &notification, nil
}

func (s *Store) MarkSent(ctx context.Context, notificationID string) error {
	_, err := s.db.Exec(ctx, `
		UPDATE notifications
		SET status = 'sent',
		    sent_at = NOW(),
		    failed_at = NULL,
		    next_attempt_at = NULL,
		    processing_started_at = NULL,
		    last_error_code = NULL,
		    last_error_message = NULL,
		    updated_at = NOW()
		WHERE id = $1
	`, notificationID)

	return err
}

func (s *Store) MarkFailed(
	ctx context.Context,
	notificationID string,
	code string,
	message string,
	nextAttemptAt *time.Time,
) error {
	_, err := s.db.Exec(ctx, `
		UPDATE notifications
		SET status = 'failed',
		    failed_at = NOW(),
		    processing_started_at = NULL,
		    next_attempt_at = $2,
		    last_error_code = $3,
		    last_error_message = $4,
		    updated_at = NOW()
		WHERE id = $1
	`, notificationID, nextAttemptAt, code, message)

	return err
}
