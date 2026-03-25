package queue

import (
	"context"
	"errors"
	"time"

	redis "github.com/redis/go-redis/v9"
)

type RedisQueue struct {
	client *redis.Client
	key    string
}

func NewRedisQueue(client *redis.Client, key string) *RedisQueue {
	return &RedisQueue{
		client: client,
		key:    key,
	}
}

func (q *RedisQueue) PushMany(ctx context.Context, ids []string) error {
	if len(ids) == 0 {
		return nil
	}

	values := make([]interface{}, 0, len(ids))
	for _, id := range ids {
		values = append(values, id)
	}

	return q.client.LPush(ctx, q.key, values...).Err()
}

func (q *RedisQueue) Pop(ctx context.Context, timeout time.Duration) (string, error) {
	result, err := q.client.BLPop(ctx, timeout, q.key).Result()
	if err != nil {
		if errors.Is(err, redis.Nil) {
			return "", nil
		}

		return "", err
	}

	if len(result) != 2 {
		return "", nil
	}

	return result[1], nil
}
