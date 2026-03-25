package worker

import (
	"encoding/json"
	"fmt"
	"strings"
)

type Job struct {
	ProfileID                 string `json:"profileId"`
	RebuildOpenGeneratedSlots bool   `json:"rebuildOpenGeneratedSlots"`
	Reason                    string `json:"reason,omitempty"`
	RequestedByUserID         string `json:"requestedByUserId,omitempty"`
}

func ParseJob(raw string) (Job, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return Job{}, fmt.Errorf("booking slot job payload is empty")
	}

	if !strings.HasPrefix(trimmed, "{") {
		return Job{
			ProfileID: trimmed,
		}, nil
	}

	var job Job
	if err := json.Unmarshal([]byte(trimmed), &job); err != nil {
		return Job{}, fmt.Errorf("parse booking slot job: %w", err)
	}

	if strings.TrimSpace(job.ProfileID) == "" {
		return Job{}, fmt.Errorf("booking slot job profileId is required")
	}

	job.ProfileID = strings.TrimSpace(job.ProfileID)
	job.Reason = strings.TrimSpace(job.Reason)
	job.RequestedByUserID = strings.TrimSpace(job.RequestedByUserID)

	return job, nil
}
