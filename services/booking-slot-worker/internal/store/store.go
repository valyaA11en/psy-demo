package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"booking-slot-worker/internal/slots"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrProfileBusy = errors.New("profile is already being processed")

type AvailabilityRule struct {
	Weekday         string
	StartTime       string
	EndTime         string
	SlotDurationMin int
	BufferMin       int
	Timezone        string
}

type GenerateResult struct {
	CreatedCount              int
	DeletedGeneratedOpenCount int
	DateFrom                  string
	DateTo                    string
	RulesCount                int
	RebuildOpenGeneratedSlots bool
	Reason                    string
	RequestedByUserID         string
}

type GenerateOptions struct {
	RebuildOpenGeneratedSlots bool
	Reason                    string
	RequestedByUserID         string
}

type Store struct {
	db *pgxpool.Pool
}

func New(db *pgxpool.Pool) *Store {
	return &Store{db: db}
}

func (s *Store) ProfilesNeedingGeneration(ctx context.Context, limit int, targetStartsBefore time.Time) ([]string, error) {
	rows, err := s.db.Query(ctx, `
		SELECT profile_id
		FROM (
			SELECT p.user_id AS profile_id,
			       COALESCE(MAX(s.starts_at), '-infinity'::timestamptz) AS latest_slot_start
			FROM psychologist_profiles AS p
			JOIN users AS u
			  ON u.id = p.user_id
			JOIN availability_rules AS r
			  ON r.psychologist_profile_id = p.user_id
			 AND r.is_active = true
			LEFT JOIN appointment_slots AS s
			  ON s.psychologist_profile_id = p.user_id
			 AND s.status IN ('open', 'held', 'booked', 'blocked')
			 AND s.starts_at >= NOW()
			WHERE p.approval_status = 'approved'
			  AND u.status = 'active'
			GROUP BY p.user_id
		) AS scoped
		WHERE latest_slot_start < $1
		ORDER BY latest_slot_start ASC, profile_id ASC
		LIMIT $2
	`, targetStartsBefore.UTC(), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	profileIDs := make([]string, 0, limit)
	for rows.Next() {
		var profileID string
		if err := rows.Scan(&profileID); err != nil {
			return nil, err
		}

		profileIDs = append(profileIDs, profileID)
	}

	return profileIDs, rows.Err()
}

func (s *Store) CancelExpiredGeneratedOpenSlots(ctx context.Context, limit int) (int64, error) {
	commandTag, err := s.db.Exec(ctx, `
		WITH expired AS (
			SELECT id
			FROM appointment_slots
			WHERE source = 'generated'
			  AND status = 'open'
			  AND ends_at < NOW()
			ORDER BY ends_at ASC
			LIMIT $1
		)
		UPDATE appointment_slots AS slots
		SET status = 'cancelled',
		    updated_at = NOW()
		FROM expired
		WHERE slots.id = expired.id
	`, limit)
	if err != nil {
		return 0, err
	}

	return commandTag.RowsAffected(), nil
}

func (s *Store) GenerateSlotsForProfile(
	ctx context.Context,
	profileID string,
	nowUTC time.Time,
	lookaheadDays int,
	options GenerateOptions,
) (GenerateResult, error) {
	tx, err := s.db.BeginTx(ctx, pgx.TxOptions{})
	if err != nil {
		return GenerateResult{}, err
	}
	defer func() {
		_ = tx.Rollback(ctx)
	}()

	locked, err := s.tryAdvisoryLock(ctx, tx, profileID)
	if err != nil {
		return GenerateResult{}, err
	}
	if !locked {
		return GenerateResult{}, ErrProfileBusy
	}

	dateFrom := startOfUTCDay(nowUTC.UTC())
	dateTo := dateFrom.AddDate(0, 0, lookaheadDays-1)
	rangeEndExclusive := dateTo.AddDate(0, 0, 1)
	deletedGeneratedOpenCount := 0

	if options.RebuildOpenGeneratedSlots {
		deletedCount, err := s.deleteOpenGeneratedSlotsInRange(ctx, tx, profileID, dateFrom, rangeEndExclusive)
		if err != nil {
			return GenerateResult{}, err
		}

		deletedGeneratedOpenCount = deletedCount
	}

	rules, err := s.loadAvailabilityRules(ctx, tx, profileID)
	if err != nil {
		return GenerateResult{}, err
	}
	if len(rules) == 0 {
		if deletedGeneratedOpenCount > 0 {
			if err := s.insertAuditLog(
				ctx,
				tx,
				profileID,
				0,
				deletedGeneratedOpenCount,
				0,
				dateFrom,
				dateTo,
				options,
			); err != nil {
				return GenerateResult{}, err
			}
		}

		if err := tx.Commit(ctx); err != nil {
			return GenerateResult{}, err
		}

		return GenerateResult{
			DeletedGeneratedOpenCount: deletedGeneratedOpenCount,
			DateFrom:                  dateFrom.Format("2006-01-02"),
			DateTo:                    dateTo.Format("2006-01-02"),
			RebuildOpenGeneratedSlots: options.RebuildOpenGeneratedSlots,
			Reason:                    options.Reason,
			RequestedByUserID:         options.RequestedByUserID,
		}, nil
	}

	existingIntervals, err := s.loadExistingIntervals(ctx, tx, profileID, dateFrom, rangeEndExclusive)
	if err != nil {
		return GenerateResult{}, err
	}

	exceptionIntervals, err := s.loadExceptionIntervals(ctx, tx, profileID, dateFrom, rangeEndExclusive)
	if err != nil {
		return GenerateResult{}, err
	}

	existingIntervals = append(existingIntervals, exceptionIntervals...)

	slotRules := make([]slots.Rule, 0, len(rules))
	for _, rule := range rules {
		slotRules = append(slotRules, slots.Rule{
			Weekday:         rule.Weekday,
			StartTime:       rule.StartTime,
			EndTime:         rule.EndTime,
			SlotDurationMin: rule.SlotDurationMin,
			BufferMin:       rule.BufferMin,
			Timezone:        rule.Timezone,
		})
	}

	generatedIntervals, err := slots.Generate(slotRules, existingIntervals, nowUTC.UTC(), dateFrom, dateTo)
	if err != nil {
		return GenerateResult{}, err
	}

	createdCount, err := s.insertGeneratedSlots(ctx, tx, profileID, generatedIntervals)
	if err != nil {
		return GenerateResult{}, err
	}

	if createdCount > 0 || deletedGeneratedOpenCount > 0 {
		if err := s.insertAuditLog(
			ctx,
			tx,
			profileID,
			createdCount,
			deletedGeneratedOpenCount,
			len(rules),
			dateFrom,
			dateTo,
			options,
		); err != nil {
			return GenerateResult{}, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return GenerateResult{}, err
	}

	return GenerateResult{
		CreatedCount:              createdCount,
		DeletedGeneratedOpenCount: deletedGeneratedOpenCount,
		DateFrom:                  dateFrom.Format("2006-01-02"),
		DateTo:                    dateTo.Format("2006-01-02"),
		RulesCount:                len(rules),
		RebuildOpenGeneratedSlots: options.RebuildOpenGeneratedSlots,
		Reason:                    options.Reason,
		RequestedByUserID:         options.RequestedByUserID,
	}, nil
}

func (s *Store) tryAdvisoryLock(ctx context.Context, tx pgx.Tx, profileID string) (bool, error) {
	var locked bool
	if err := tx.QueryRow(ctx, `
		SELECT pg_try_advisory_xact_lock(hashtext($1)::bigint)
	`, profileID).Scan(&locked); err != nil {
		return false, err
	}

	return locked, nil
}

func (s *Store) loadAvailabilityRules(ctx context.Context, tx pgx.Tx, profileID string) ([]AvailabilityRule, error) {
	rows, err := tx.Query(ctx, `
		SELECT r.weekday::text,
		       r.start_time,
		       r.end_time,
		       r.slot_duration_min,
		       r.buffer_min,
		       r.timezone
		FROM availability_rules AS r
		JOIN psychologist_profiles AS p
		  ON p.user_id = r.psychologist_profile_id
		JOIN users AS u
		  ON u.id = p.user_id
		WHERE r.psychologist_profile_id = $1
		  AND r.is_active = true
		  AND p.approval_status = 'approved'
		  AND u.status = 'active'
		ORDER BY r.weekday ASC, r.start_time ASC
	`, profileID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	rules := make([]AvailabilityRule, 0)
	for rows.Next() {
		var rule AvailabilityRule
		if err := rows.Scan(
			&rule.Weekday,
			&rule.StartTime,
			&rule.EndTime,
			&rule.SlotDurationMin,
			&rule.BufferMin,
			&rule.Timezone,
		); err != nil {
			return nil, err
		}

		rules = append(rules, rule)
	}

	return rules, rows.Err()
}

func (s *Store) loadExistingIntervals(
	ctx context.Context,
	tx pgx.Tx,
	profileID string,
	rangeStart time.Time,
	rangeEndExclusive time.Time,
) ([]slots.Interval, error) {
	rows, err := tx.Query(ctx, `
		SELECT starts_at, ends_at
		FROM appointment_slots
		WHERE psychologist_profile_id = $1
		  AND starts_at < $2
		  AND ends_at > $3
		ORDER BY starts_at ASC
	`, profileID, rangeEndExclusive.UTC(), rangeStart.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	intervals := make([]slots.Interval, 0)
	for rows.Next() {
		var interval slots.Interval
		if err := rows.Scan(&interval.StartsAt, &interval.EndsAt); err != nil {
			return nil, err
		}

		intervals = append(intervals, interval)
	}

	return intervals, rows.Err()
}

func (s *Store) loadExceptionIntervals(
	ctx context.Context,
	tx pgx.Tx,
	profileID string,
	rangeStart time.Time,
	rangeEndExclusive time.Time,
) ([]slots.Interval, error) {
	rows, err := tx.Query(ctx, `
		SELECT starts_at, ends_at
		FROM availability_exceptions
		WHERE psychologist_profile_id = $1
		  AND is_active = true
		  AND starts_at < $2
		  AND ends_at > $3
		ORDER BY starts_at ASC
	`, profileID, rangeEndExclusive.UTC(), rangeStart.UTC())
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	intervals := make([]slots.Interval, 0)
	for rows.Next() {
		var interval slots.Interval
		if err := rows.Scan(&interval.StartsAt, &interval.EndsAt); err != nil {
			return nil, err
		}

		intervals = append(intervals, interval)
	}

	return intervals, rows.Err()
}

func (s *Store) deleteOpenGeneratedSlotsInRange(
	ctx context.Context,
	tx pgx.Tx,
	profileID string,
	rangeStart time.Time,
	rangeEndExclusive time.Time,
) (int, error) {
	commandTag, err := tx.Exec(ctx, `
		DELETE FROM appointment_slots
		WHERE psychologist_profile_id = $1
		  AND source = 'generated'
		  AND status = 'open'
		  AND starts_at >= $2
		  AND starts_at < $3
	`, profileID, rangeStart.UTC(), rangeEndExclusive.UTC())
	if err != nil {
		return 0, err
	}

	return int(commandTag.RowsAffected()), nil
}

func (s *Store) insertGeneratedSlots(
	ctx context.Context,
	tx pgx.Tx,
	profileID string,
	intervals []slots.Interval,
) (int, error) {
	createdCount := 0

	for _, interval := range intervals {
		commandTag, err := tx.Exec(ctx, `
			INSERT INTO appointment_slots (
				psychologist_profile_id,
				starts_at,
				ends_at,
				status,
				source
			)
			VALUES ($1, $2, $3, 'open', 'generated')
			ON CONFLICT (psychologist_profile_id, starts_at, ends_at) DO NOTHING
		`, profileID, interval.StartsAt.UTC(), interval.EndsAt.UTC())
		if err != nil {
			return 0, err
		}

		createdCount += int(commandTag.RowsAffected())
	}

	return createdCount, nil
}

func (s *Store) insertAuditLog(
	ctx context.Context,
	tx pgx.Tx,
	profileID string,
	createdCount int,
	deletedGeneratedOpenCount int,
	rulesCount int,
	dateFrom time.Time,
	dateTo time.Time,
	options GenerateOptions,
) error {
	metadata, err := json.Marshal(map[string]any{
		"source":                    "booking-slot-worker",
		"createdCount":              createdCount,
		"deletedGeneratedOpenCount": deletedGeneratedOpenCount,
		"rulesCount":                rulesCount,
		"dateFrom":                  dateFrom.Format("2006-01-02"),
		"dateTo":                    dateTo.Format("2006-01-02"),
		"rebuildOpenGeneratedSlots": options.RebuildOpenGeneratedSlots,
		"reason":                    options.Reason,
		"requestedByUserId":         options.RequestedByUserID,
	})
	if err != nil {
		return fmt.Errorf("marshal audit metadata: %w", err)
	}

	action := "appointment_slots.generate_worker"
	if options.RebuildOpenGeneratedSlots {
		action = "appointment_slots.rebuild_worker"
	}

	_, err = tx.Exec(ctx, `
		INSERT INTO audit_logs (
			actor_user_id,
			actor_role,
			action,
			entity_type,
			entity_id,
			metadata_json
		)
		VALUES (NULL, 'system', $2, 'psychologist_profile', $1, $3::json)
	`, profileID, action, string(metadata))

	return err
}

func startOfUTCDay(value time.Time) time.Time {
	value = value.UTC()
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}
