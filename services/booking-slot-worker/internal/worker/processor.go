package worker

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"booking-slot-worker/internal/store"
)

type Processor struct {
	logger        *slog.Logger
	store         *store.Store
	lookaheadDays int
}

func NewProcessor(logger *slog.Logger, store *store.Store, lookaheadDays int) *Processor {
	return &Processor{
		logger:        logger,
		store:         store,
		lookaheadDays: lookaheadDays,
	}
}

func (p *Processor) Process(ctx context.Context, rawJob string, workerID int) {
	job, err := ParseJob(rawJob)
	if err != nil {
		p.logger.Error(
			"failed to parse booking slot job",
			"worker", workerID,
			"payload", rawJob,
			"error", err,
		)
		return
	}

	result, err := p.store.GenerateSlotsForProfile(ctx, job.ProfileID, time.Now().UTC(), p.lookaheadDays, store.GenerateOptions{
		RebuildOpenGeneratedSlots: job.RebuildOpenGeneratedSlots,
		Reason:                    job.Reason,
		RequestedByUserID:         job.RequestedByUserID,
	})
	if err != nil {
		if errors.Is(err, store.ErrProfileBusy) {
			return
		}

		p.logger.Error(
			"failed to generate appointment slots",
			"worker", workerID,
			"profile_id", job.ProfileID,
			"error", err,
		)
		return
	}

	if result.CreatedCount == 0 && result.DeletedGeneratedOpenCount == 0 {
		return
	}

	p.logger.Info(
		"processed booking slot job",
		"worker", workerID,
		"profile_id", job.ProfileID,
		"created_count", result.CreatedCount,
		"deleted_generated_open_count", result.DeletedGeneratedOpenCount,
		"rules_count", result.RulesCount,
		"date_from", result.DateFrom,
		"date_to", result.DateTo,
		"rebuild_open_generated_slots", result.RebuildOpenGeneratedSlots,
		"reason", result.Reason,
	)
}
