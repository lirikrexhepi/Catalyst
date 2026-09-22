package remote

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/skip2/go-qrcode"
)

const CookieName = "composer_remote_token"

// Failed-credential budget. Past it, PIN logins are refused until the
// window rolls over; the 192-bit token (what the QR code carries) keeps
// working, so pairing by scan is never locked out.
const (
	failureWindow = 15 * time.Minute
	maxFailures   = 20
	pinDigits     = 8
)

type AuthManager struct {
	mu       sync.RWMutex
	token    string
	pin      string
	failures []time.Time
}

func NewAuthManager() *AuthManager {
	a := &AuthManager{}
	a.Regenerate()
	return a
}

func (a *AuthManager) Regenerate() {
	a.mu.Lock()
	defer a.mu.Unlock()

	b := make([]byte, 24)
	_, _ = rand.Read(b)
	a.token = hex.EncodeToString(b)

	// 8-digit numeric PIN (10^8 space) behind a global failure budget.
	n, _ := rand.Int(rand.Reader, big.NewInt(90000000))
	a.pin = fmt.Sprintf("%0*d", pinDigits, n.Int64()+10000000)
	a.failures = nil
}

func (a *AuthManager) Token() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.token
}

func (a *AuthManager) PIN() string {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.pin
}

// Validate checks the candidate against the token, or the PIN while the
// failure budget is not exhausted. Every mismatch is counted.
func (a *AuthManager) Validate(candidate string) bool {
	if candidate == "" {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()

	if subtle.ConstantTimeCompare([]byte(a.token), []byte(candidate)) == 1 {
		return true
	}
	a.pruneFailuresLocked()
	if len(a.failures) < maxFailures && subtle.ConstantTimeCompare([]byte(a.pin), []byte(candidate)) == 1 {
		return true
	}
	a.failures = append(a.failures, time.Now())
	return false
}

// Locked reports whether PIN logins are currently refused.
func (a *AuthManager) Locked() bool {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.pruneFailuresLocked()
	return len(a.failures) >= maxFailures
}

func (a *AuthManager) pruneFailuresLocked() {
	cutoff := time.Now().Add(-failureWindow)
	keep := a.failures[:0]
	for _, at := range a.failures {
		if at.After(cutoff) {
			keep = append(keep, at)
		}
	}
	a.failures = keep
}

// AuthenticateRequest extracts and verifies credentials from request headers, query params, or cookies.
func (a *AuthManager) AuthenticateRequest(r *http.Request) bool {
	// 1. Query parameter: ?token=... or ?pin=...
	if token := r.URL.Query().Get("token"); token != "" {
		if a.Validate(token) {
			return true
		}
	}
	if pin := r.URL.Query().Get("pin"); pin != "" {
		if a.Validate(pin) {
			return true
		}
	}

	// 2. Authorization Header: Bearer <token>
	if auth := r.Header.Get("Authorization"); auth != "" {
		parts := strings.SplitN(auth, " ", 2)
		if len(parts) == 2 && strings.EqualFold(parts[0], "Bearer") {
			if a.Validate(strings.TrimSpace(parts[1])) {
				return true
			}
		}
	}

	// 3. Cookie: composer_remote_token
	if cookie, err := r.Cookie(CookieName); err == nil && cookie != nil {
		if a.Validate(cookie.Value) {
			return true
		}
	}

	return false
}

// GenerateQRCodePNG returns a data URI (data:image/png;base64,...) for the pairing URL.
func GenerateQRCodePNG(url string) (string, error) {
	png, err := qrcode.Encode(url, qrcode.Medium, 300)
	if err != nil {
		return "", err
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png), nil
}
