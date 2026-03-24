package slots

import (
	"testing"
	"time"
)

func TestGenerateCreatesFutureSlots(t *testing.T) {
	nowUTC := time.Date(2026, 3, 24, 6, 0, 0, 0, time.UTC)
	dateFrom := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)

	generated, err := Generate([]Rule{
		{
			Weekday:         "tuesday",
			StartTime:       "10:00",
			EndTime:         "12:00",
			SlotDurationMin: 60,
			BufferMin:       0,
			Timezone:        "UTC",
		},
	}, nil, nowUTC, dateFrom, dateTo)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(generated) != 2 {
		t.Fatalf("expected 2 slots, got %d", len(generated))
	}
}

func TestGenerateSkipsOverlappingExistingSlotsIncludingCancelled(t *testing.T) {
	nowUTC := time.Date(2026, 3, 24, 6, 0, 0, 0, time.UTC)
	dateFrom := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)

	generated, err := Generate([]Rule{
		{
			Weekday:         "tuesday",
			StartTime:       "10:00",
			EndTime:         "12:00",
			SlotDurationMin: 60,
			BufferMin:       0,
			Timezone:        "UTC",
		},
	}, []Interval{
		{
			StartsAt: time.Date(2026, 3, 24, 10, 0, 0, 0, time.UTC),
			EndsAt:   time.Date(2026, 3, 24, 11, 0, 0, 0, time.UTC),
		},
	}, nowUTC, dateFrom, dateTo)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(generated) != 1 {
		t.Fatalf("expected 1 slot, got %d", len(generated))
	}

	if generated[0].StartsAt.Hour() != 11 {
		t.Fatalf("expected remaining slot at 11:00 UTC, got %s", generated[0].StartsAt)
	}
}

func TestGenerateHonorsTimezone(t *testing.T) {
	nowUTC := time.Date(2026, 3, 23, 20, 0, 0, 0, time.UTC)
	dateFrom := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)
	dateTo := time.Date(2026, 3, 24, 0, 0, 0, 0, time.UTC)

	generated, err := Generate([]Rule{
		{
			Weekday:         "tuesday",
			StartTime:       "10:00",
			EndTime:         "11:00",
			SlotDurationMin: 60,
			BufferMin:       0,
			Timezone:        "Asia/Yekaterinburg",
		},
	}, nil, nowUTC, dateFrom, dateTo)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if len(generated) != 1 {
		t.Fatalf("expected 1 slot, got %d", len(generated))
	}

	if generated[0].StartsAt.Hour() != 5 {
		t.Fatalf("expected slot to start at 05:00 UTC, got %s", generated[0].StartsAt)
	}
}
