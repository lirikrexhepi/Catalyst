package claude

import (
	"os"
	"path/filepath"
	"testing"
)

// Mirrors the real ~/.claude.json shape on CLI 2.1.220, trimmed to the quota
// subtree. Percentages and reset times are the fields the panel renders.
const quotaFixture = `{
  "numStartups": 42,
  "cachedUsageUtilization": {
    "fetchedAtMs": 1786817326431,
    "utilization": {
      "five_hour": {"utilization": 28, "resets_at": "2026-08-15T22:20:00.376947+00:00"},
      "seven_day": {"utilization": 71, "resets_at": "2026-08-16T06:00:00.376973+00:00"},
      "seven_day_opus": null,
      "limits": [
        {"kind":"session","group":"session","percent":28,"severity":"normal","resets_at":"2026-08-15T22:20:00.376947+00:00","is_active":false},
        {"kind":"weekly_all","group":"weekly","percent":71,"severity":"normal","resets_at":"2026-08-16T06:00:00.376973+00:00","is_active":true}
      ]
    }
  }
}`

func writeQuota(t *testing.T, contents string) string {
	t.Helper()
	home := t.TempDir()
	if err := os.WriteFile(filepath.Join(home, quotaFile), []byte(contents), 0o600); err != nil {
		t.Fatalf("write fixture: %v", err)
	}
	return home
}

func TestReadQuotaFromConfigCache(t *testing.T) {
	limits, fetchedAt, err := ReadQuota(writeQuota(t, quotaFixture))
	if err != nil {
		t.Fatalf("ReadQuota: %v", err)
	}
	if fetchedAt != 1786817326431 {
		t.Errorf("fetchedAt = %d, want 1786817326431", fetchedAt)
	}
	if len(limits) != 2 {
		t.Fatalf("expected 2 windows, got %d: %+v", len(limits), limits)
	}

	byWindow := map[string]int{}
	resets := map[string]int64{}
	for _, limit := range limits {
		if limit.UsedPercent == nil {
			t.Fatalf("window %q has no percentage", limit.Window)
		}
		byWindow[limit.Window] = *limit.UsedPercent
		resets[limit.Window] = limit.ResetsAt
	}

	if byWindow["five_hour"] != 28 {
		t.Errorf("five_hour = %d%%, want 28", byWindow["five_hour"])
	}
	if byWindow["seven_day"] != 71 {
		t.Errorf("seven_day = %d%%, want 71", byWindow["seven_day"])
	}
	if resets["five_hour"] == 0 {
		t.Error("five_hour resets_at did not parse")
	}
}

func TestReadQuotaMissingFile(t *testing.T) {
	if _, _, err := ReadQuota(t.TempDir()); err == nil {
		t.Error("expected an error when the config file is absent")
	}
}

func TestReadQuotaWithoutCacheSection(t *testing.T) {
	limits, _, err := ReadQuota(writeQuota(t, `{"numStartups": 1}`))
	if err != nil {
		t.Fatalf("a config without quota must not error: %v", err)
	}
	if len(limits) != 0 {
		t.Errorf("expected no windows, got %+v", limits)
	}
}

func TestReadQuotaSkipsNullPercentages(t *testing.T) {
	const fixture = `{"cachedUsageUtilization":{"fetchedAtMs":1,"utilization":{"limits":[
      {"kind":"session","percent":null,"severity":"normal"},
      {"kind":"weekly_all","percent":12,"severity":"normal"}]}}}`

	limits, _, err := ReadQuota(writeQuota(t, fixture))
	if err != nil {
		t.Fatalf("ReadQuota: %v", err)
	}
	// A null percentage is "not reported"; rendering it as 0% would misstate quota.
	if len(limits) != 1 || limits[0].Window != "seven_day" {
		t.Fatalf("expected only the reported window, got %+v", limits)
	}
}

func TestReadQuotaMalformedJSON(t *testing.T) {
	if _, _, err := ReadQuota(writeQuota(t, `{not json`)); err == nil {
		t.Error("expected an error for malformed config")
	}
}
