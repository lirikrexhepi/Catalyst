package projects

import (
	"os"
	"path/filepath"
	"sync"
	"time"
)

// negativeTTL bounds how long a "no favicon" answer is trusted. Projects gain
// icons over time (a favicon added mid-session should show up), so misses are
// re-scanned after this interval rather than cached forever.
const negativeTTL = 5 * time.Minute

// maxCachedProjects bounds cache memory: entries are at most
// maxFaviconBytes each, and the project list is small, but an unbounded map
// keyed by path is still a leak vector.
const maxCachedProjects = 256

type faviconEntry struct {
	data      []byte
	ctype     string
	iconPath  string
	size      int64
	mtime     time.Time
	missing   bool
	checkedAt time.Time
	usedAt    time.Time
}

// Cache memoises favicon lookups per project root. Hits on an unchanged icon
// file cost a single stat instead of a full scan; a changed or vanished file
// triggers a rescan immediately, and misses are re-scanned after negativeTTL.
type Cache struct {
	mu      sync.Mutex
	entries map[string]*faviconEntry
	now     func() time.Time
}

// Default is the shared cache used by the desktop binding and the phone route
// so both see the same answers.
var Default = NewCache()

// NewCache reports an empty cache. The clock hook exists for tests.
func NewCache() *Cache {
	return &Cache{entries: make(map[string]*faviconEntry), now: time.Now}
}

// Find behaves like the package Find but serves cached answers when the icon
// file on disk is unchanged.
func (c *Cache) Find(root string) ([]byte, string, error) {
	clean := filepath.Clean(root)
	now := c.now()

	c.mu.Lock()
	entry, ok := c.entries[clean]
	if ok {
		entry.usedAt = now
		if !entry.missing {
			hit, fresh := c.validateLocked(entry)
			if fresh {
				data, ctype := hit.data, hit.ctype
				c.mu.Unlock()
				return data, ctype, nil
			}
		} else if now.Sub(entry.checkedAt) < negativeTTL {
			c.mu.Unlock()
			return nil, "", ErrNoFavicon
		}
	}
	c.mu.Unlock()

	data, ctype, iconPath, err := find(clean)
	c.mu.Lock()
	defer c.mu.Unlock()
	if err != nil {
		c.storeLocked(clean, &faviconEntry{missing: true, checkedAt: now, usedAt: now})
		return nil, "", ErrNoFavicon
	}
	var size int64 = -1
	var mtime time.Time
	if info, statErr := os.Stat(iconPath); statErr == nil {
		size, mtime = info.Size(), info.ModTime()
	}
	c.storeLocked(clean, &faviconEntry{
		data: data, ctype: ctype, iconPath: iconPath,
		size: size, mtime: mtime, checkedAt: now, usedAt: now,
	})
	return data, ctype, nil
}

// validateLocked re-stats the cached icon file. Same size and modtime means
// the bytes are still good; anything else forces a rescan by the caller.
func (c *Cache) validateLocked(entry *faviconEntry) (*faviconEntry, bool) {
	info, err := os.Stat(entry.iconPath)
	if err != nil || info.Size() != entry.size || !info.ModTime().Equal(entry.mtime) {
		return nil, false
	}
	return entry, true
}

func (c *Cache) storeLocked(root string, entry *faviconEntry) {
	if len(c.entries) >= maxCachedProjects {
		c.evictLocked()
	}
	c.entries[root] = entry
}

// evictLocked drops the least recently used half, keeping the map bounded
// without churning entries that are actually serving rows.
func (c *Cache) evictLocked() {
	oldest := make([]string, 0, len(c.entries))
	for root := range c.entries {
		oldest = append(oldest, root)
	}
	for i := 0; i < len(oldest); i++ {
		for j := i + 1; j < len(oldest); j++ {
			if c.entries[oldest[j]].usedAt.Before(c.entries[oldest[i]].usedAt) {
				oldest[i], oldest[j] = oldest[j], oldest[i]
			}
		}
	}
	for _, root := range oldest[:len(oldest)/2+1] {
		delete(c.entries, root)
	}
}

// FindCached serves the shared cache. This is what the UI entry points call.
func FindCached(root string) ([]byte, string, error) {
	return Default.Find(root)
}
