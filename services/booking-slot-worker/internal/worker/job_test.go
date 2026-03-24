package worker

import "testing"

func TestParseJobFromProfileID(t *testing.T) {
	job, err := ParseJob("profile-123")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if job.ProfileID != "profile-123" {
		t.Fatalf("expected profile-123, got %s", job.ProfileID)
	}

	if job.RebuildOpenGeneratedSlots {
		t.Fatal("expected rebuild flag to be false for plain profile id payload")
	}
}

func TestParseJobFromJSON(t *testing.T) {
	job, err := ParseJob(`{"profileId":"profile-123","rebuildOpenGeneratedSlots":true,"reason":"availability_rule_updated"}`)
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}

	if !job.RebuildOpenGeneratedSlots {
		t.Fatal("expected rebuild flag to be true")
	}

	if job.Reason != "availability_rule_updated" {
		t.Fatalf("expected reason availability_rule_updated, got %s", job.Reason)
	}
}
