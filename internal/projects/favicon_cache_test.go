package projects

import (
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestCacheServesHitWithoutRescan(t *testing.T) {
	root := t.TempDir()
	writeFile(t, filepath.Join(root, "favicon.ico"), "ONE")

	cache := NewCache()
	data, _, err := cache.Find(root)
	if err != nil || string(data) != "ONE" {
		t.Fatalf("first Find = %q, %v", data, err)
	}
	// A removed icon is noticed on the next lookup (stat fails, rescan
	// misses) rather than served stale.
	if err := os.Remove(filepath.Join(root, "favicon.ico")); err != nil {
		t.Fatal(err)
	}
	if _, _, err := cache.Find(root); err != ErrNoFavicon {
		t.Fatalf("after remove got %v, want ErrNoFavicon", err)
	}
}

func TestCacheInvalidatesOnChange(t *testing.T) {
	root := t.TempDir()
	icon := filepath.Join(root, "favicon.ico")
	writeFile(t, icon, "ONE")

	cache := NewCache()
	if _, _, err := cache.Find(root); err != nil {
		t.Fatalf("first Find: %v", err)
	}
	past := time.Now().Add(-time.Hour)
	if err := os.Chtimes(icon, past, past); err != nil {
		t.Fatal(err)
	}
	writeFile(t, icon, "TWO-LONGER")
	data, _, err := cache.Find(root)
	if err != nil {
		t.Fatalf("second Find: %v", err)
	}
	if string(data) != "TWO-LONGER" {
		t.Fatalf("got %q, want rescanned bytes", data)
	}
}

func TestCacheNegativeRescansAfterTTL(t *testing.T) {
	root := t.TempDir()
	now := time.Now()
	cache := &Cache{entries: make(map[string]*faviconEntry), now: func() time.Time { return now }}

	if _, _, err := cache.Find(root); err != ErrNoFavicon {
		t.Fatalf("got %v, want ErrNoFavicon", err)
	}
	writeFile(t, filepath.Join(root, "favicon.ico"), "LATE")
	if _, _, err := cache.Find(root); err != ErrNoFavicon {
		t.Fatalf("within TTL got %v, want ErrNoFavicon", err)
	}
	now = now.Add(negativeTTL + time.Second)
	data, _, err := cache.Find(root)
	if err != nil || string(data) != "LATE" {
		t.Fatalf("after TTL got %q, %v", data, err)
	}
}
