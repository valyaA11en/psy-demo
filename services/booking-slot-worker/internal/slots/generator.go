package slots

import (
	"fmt"
	"strings"
	"time"
)

type Rule struct {
	Weekday         string
	StartTime       string
	EndTime         string
	SlotDurationMin int
	BufferMin       int
	Timezone        string
}

type Interval struct {
	StartsAt time.Time
	EndsAt   time.Time
}

func Generate(
	rules []Rule,
	existing []Interval,
	nowUTC time.Time,
	dateFrom time.Time,
	dateTo time.Time,
) ([]Interval, error) {
	nowUTC = nowUTC.UTC()
	cursor := startOfUTCDay(dateFrom)
	endDate := startOfUTCDay(dateTo)
	intervals := append([]Interval(nil), existing...)
	generated := make([]Interval, 0)

	for !cursor.After(endDate) {
		for _, rule := range rules {
			location, err := time.LoadLocation(rule.Timezone)
			if err != nil {
				return nil, fmt.Errorf("load timezone %s: %w", rule.Timezone, err)
			}

			localDate := time.Date(cursor.Year(), cursor.Month(), cursor.Day(), 0, 0, 0, 0, location)
			if weekdayFromTime(localDate) != rule.Weekday {
				continue
			}

			slotStart, err := combineLocalDateAndTime(localDate, rule.StartTime)
			if err != nil {
				return nil, err
			}

			windowEnd, err := combineLocalDateAndTime(localDate, rule.EndTime)
			if err != nil {
				return nil, err
			}

			for slotStart.Add(time.Duration(rule.SlotDurationMin)*time.Minute).Compare(windowEnd) <= 0 {
				slotEnd := slotStart.Add(time.Duration(rule.SlotDurationMin) * time.Minute)
				slotStartUTC := slotStart.UTC()
				slotEndUTC := slotEnd.UTC()

				if slotStartUTC.After(nowUTC) && !hasOverlap(intervals, slotStartUTC, slotEndUTC) {
					interval := Interval{
						StartsAt: slotStartUTC,
						EndsAt:   slotEndUTC,
					}
					generated = append(generated, interval)
					intervals = append(intervals, interval)
				}

				slotStart = slotEnd.Add(time.Duration(rule.BufferMin) * time.Minute)
			}
		}

		cursor = cursor.AddDate(0, 0, 1)
	}

	return generated, nil
}

func startOfUTCDay(value time.Time) time.Time {
	value = value.UTC()
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}

func combineLocalDateAndTime(date time.Time, hhmm string) (time.Time, error) {
	parts := strings.Split(hhmm, ":")
	if len(parts) != 2 {
		return time.Time{}, fmt.Errorf("invalid time format %s", hhmm)
	}

	hour, err := parseClockPart(parts[0], 23)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid hour in %s: %w", hhmm, err)
	}

	minute, err := parseClockPart(parts[1], 59)
	if err != nil {
		return time.Time{}, fmt.Errorf("invalid minute in %s: %w", hhmm, err)
	}

	value := time.Date(date.Year(), date.Month(), date.Day(), hour, minute, 0, 0, date.Location())
	if value.Year() != date.Year() || value.Month() != date.Month() || value.Day() != date.Day() || value.Hour() != hour || value.Minute() != minute {
		return time.Time{}, fmt.Errorf("invalid local date-time %s in %s", hhmm, date.Location())
	}

	return value, nil
}

func parseClockPart(value string, max int) (int, error) {
	if len(value) != 2 {
		return 0, fmt.Errorf("expected 2 digits")
	}

	parsed := int(value[0]-'0')*10 + int(value[1]-'0')
	if value[0] < '0' || value[0] > '9' || value[1] < '0' || value[1] > '9' {
		return 0, fmt.Errorf("not numeric")
	}

	if parsed < 0 || parsed > max {
		return 0, fmt.Errorf("out of range")
	}

	return parsed, nil
}

func weekdayFromTime(value time.Time) string {
	switch value.Weekday() {
	case time.Monday:
		return "monday"
	case time.Tuesday:
		return "tuesday"
	case time.Wednesday:
		return "wednesday"
	case time.Thursday:
		return "thursday"
	case time.Friday:
		return "friday"
	case time.Saturday:
		return "saturday"
	default:
		return "sunday"
	}
}

func hasOverlap(intervals []Interval, startsAt time.Time, endsAt time.Time) bool {
	for _, interval := range intervals {
		if startsAt.Before(interval.EndsAt) && endsAt.After(interval.StartsAt) {
			return true
		}
	}

	return false
}
