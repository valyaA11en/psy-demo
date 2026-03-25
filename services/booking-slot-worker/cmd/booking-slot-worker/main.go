package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	bookingconfig "booking-slot-worker/internal/config"
	"booking-slot-worker/internal/queue"
	"booking-slot-worker/internal/store"
	"booking-slot-worker/internal/worker"

	"github.com/jackc/pgx/v5/pgxpool"
	redis "github.com/redis/go-redis/v9"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := bookingconfig.Load()
	if err != nil {
		logger.Error("failed to load config", "error", err)
		os.Exit(1)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("failed to connect postgres", "error", err)
		os.Exit(1)
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		logger.Error("failed to ping postgres", "error", err)
		os.Exit(1)
	}

	redisOptions, err := redis.ParseURL(cfg.RedisURL)
	if err != nil {
		logger.Error("failed to parse redis url", "error", err)
		os.Exit(1)
	}

	redisClient := redis.NewClient(redisOptions)
	defer func() {
		_ = redisClient.Close()
	}()

	if err := redisClient.Ping(ctx).Err(); err != nil {
		logger.Error("failed to ping redis", "error", err)
		os.Exit(1)
	}

	logger.Info(
		"booking slot worker started",
		"concurrency", cfg.Concurrency,
		"queue", cfg.QueueKey,
		"lookahead_days", cfg.LookaheadDays,
	)

	slotStore := store.New(db)
	slotQueue := queue.NewRedisQueue(redisClient, cfg.QueueKey)
	processor := worker.NewProcessor(logger, slotStore, cfg.LookaheadDays)

	jobs := make(chan string, cfg.Concurrency*4)
	var workersWG sync.WaitGroup

	for idx := 0; idx < cfg.Concurrency; idx++ {
		workersWG.Add(1)

		go func(workerID int) {
			defer workersWG.Done()

			for {
				select {
				case <-ctx.Done():
					return
				case jobPayload, ok := <-jobs:
					if !ok {
						return
					}

					processor.Process(ctx, jobPayload, workerID)
				}
			}
		}(idx + 1)
	}

	var backgroundWG sync.WaitGroup
	backgroundWG.Add(2)

	go func() {
		defer backgroundWG.Done()
		runPoller(ctx, logger, slotQueue, jobs, cfg.PopTimeout)
	}()

	go func() {
		defer backgroundWG.Done()
		runSweeper(ctx, logger, slotStore, slotQueue, cfg)
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	backgroundWG.Wait()
	close(jobs)
	workersWG.Wait()

	logger.Info("booking slot worker stopped")
}

func runPoller(
	ctx context.Context,
	logger *slog.Logger,
	slotQueue *queue.RedisQueue,
	jobs chan<- string,
	popTimeout time.Duration,
) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		profileID, err := slotQueue.Pop(ctx, popTimeout)
		if err != nil {
			if ctx.Err() != nil {
				return
			}

			logger.Error("failed to pop booking slot job", "error", err)
			time.Sleep(time.Second)
			continue
		}

		if profileID == "" {
			continue
		}

		select {
		case jobs <- profileID:
		case <-ctx.Done():
			return
		}
	}
}

func runSweeper(
	ctx context.Context,
	logger *slog.Logger,
	slotStore *store.Store,
	slotQueue *queue.RedisQueue,
	cfg bookingconfig.Config,
) {
	enqueueProfiles := func() {
		cancelledCount, err := slotStore.CancelExpiredGeneratedOpenSlots(ctx, cfg.CleanupBatchSize)
		if err != nil {
			if ctx.Err() == nil {
				logger.Error("failed to cancel expired generated slots", "error", err)
			}
			return
		}

		if cancelledCount > 0 {
			logger.Info("cancelled expired generated slots", "count", cancelledCount)
		}

		nowUTC := time.Now().UTC()
		targetStartsBefore := time.Date(nowUTC.Year(), nowUTC.Month(), nowUTC.Day(), 0, 0, 0, 0, time.UTC).
			AddDate(0, 0, cfg.LookaheadDays-1)
		profileIDs, err := slotStore.ProfilesNeedingGeneration(ctx, cfg.SweepBatchSize, targetStartsBefore)
		if err != nil {
			if ctx.Err() == nil {
				logger.Error("failed to load psychologist profiles for slot generation", "error", err)
			}
			return
		}

		if len(profileIDs) == 0 {
			return
		}

		if err := slotQueue.PushMany(ctx, profileIDs); err != nil {
			if ctx.Err() == nil {
				logger.Error("failed to enqueue booking slot jobs", "error", err)
			}
			return
		}

		logger.Info("enqueued booking slot jobs", "count", len(profileIDs))
	}

	enqueueProfiles()

	ticker := time.NewTicker(cfg.SweepInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			enqueueProfiles()
		}
	}
}
