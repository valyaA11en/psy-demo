package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	notificationconfig "notification-worker/internal/config"
	"notification-worker/internal/delivery"
	"notification-worker/internal/queue"
	"notification-worker/internal/store"
	"notification-worker/internal/worker"

	"github.com/jackc/pgx/v5/pgxpool"
	redis "github.com/redis/go-redis/v9"
)

func main() {
	logger := slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	}))

	cfg, err := notificationconfig.Load()
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

	logger.Info("notification worker started", "concurrency", cfg.Concurrency, "queue", cfg.QueueKey)

	notificationStore := store.New(db)
	notificationQueue := queue.NewRedisQueue(redisClient, cfg.QueueKey)
	dispatcher, err := delivery.NewDispatcher(logger, cfg)
	if err != nil {
		logger.Error("failed to initialize delivery dispatcher", "error", err)
		os.Exit(1)
	}

	processor := worker.NewProcessor(logger, notificationStore, dispatcher, cfg.RetryBase, cfg.RetryMax)

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
				case notificationID, ok := <-jobs:
					if !ok {
						return
					}

					processor.Process(ctx, notificationID, workerID)
				}
			}
		}(idx + 1)
	}

	var backgroundWG sync.WaitGroup
	backgroundWG.Add(2)

	go func() {
		defer backgroundWG.Done()
		runPoller(ctx, logger, notificationQueue, jobs, cfg.PopTimeout)
	}()

	go func() {
		defer backgroundWG.Done()
		runSweeper(
			ctx,
			logger,
			notificationStore,
			notificationQueue,
			cfg.SweepInterval,
			cfg.SweepBatchSize,
			cfg.ProcessingTimeout,
		)
	}()

	<-ctx.Done()
	logger.Info("shutdown signal received")

	backgroundWG.Wait()
	close(jobs)
	workersWG.Wait()

	logger.Info("notification worker stopped")
}

func runPoller(
	ctx context.Context,
	logger *slog.Logger,
	notificationQueue *queue.RedisQueue,
	jobs chan<- string,
	popTimeout time.Duration,
) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		notificationID, err := notificationQueue.Pop(ctx, popTimeout)
		if err != nil {
			if ctx.Err() != nil {
				return
			}

			logger.Error("failed to pop notification job", "error", err)
			time.Sleep(time.Second)
			continue
		}

		if notificationID == "" {
			continue
		}

		select {
		case jobs <- notificationID:
		case <-ctx.Done():
			return
		}
	}
}

func runSweeper(
	ctx context.Context,
	logger *slog.Logger,
	notificationStore *store.Store,
	notificationQueue *queue.RedisQueue,
	interval time.Duration,
	batchSize int,
	processingTimeout time.Duration,
) {
	enqueueDue := func() {
		recoveredCount, err := notificationStore.RecoverStaleProcessing(ctx, processingTimeout, batchSize)
		if err != nil {
			if ctx.Err() == nil {
				logger.Error("failed to recover stale notifications", "error", err)
			}
			return
		}

		if recoveredCount > 0 {
			logger.Warn("recovered stale processing notifications", "count", recoveredCount)
		}

		ids, err := notificationStore.DueNotificationIDs(ctx, batchSize)
		if err != nil {
			if ctx.Err() == nil {
				logger.Error("failed to load due notifications", "error", err)
			}
			return
		}

		if len(ids) == 0 {
			return
		}

		if err := notificationQueue.PushMany(ctx, ids); err != nil {
			if ctx.Err() == nil {
				logger.Error("failed to enqueue due notifications", "error", err)
			}
			return
		}

		logger.Info("swept queued notifications", "count", len(ids))
	}

	enqueueDue()

	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			enqueueDue()
		}
	}
}
