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

	"github.com/skip2/go-qrcode"
)

const CookieName = "composer_remote_token"

type AuthManager struct {
	mu    sync.RWMutex
	token string
	pin   string
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

	// 6-digit numeric PIN
	n, _ := rand.Int(rand.Reader, big.NewInt(900000))
	a.pin = fmt.Sprintf("%06d", n.Int64()+100000)
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

// Validate checks if the provided string matches either the 256-bit token or the 6-digit PIN.
func (a *AuthManager) Validate(candidate string) bool {
	if candidate == "" {
		return false
	}
	a.mu.RLock()
	defer a.mu.RUnlock()

	tokenMatch := subtle.ConstantTimeCompare([]byte(a.token), []byte(candidate)) == 1
	pinMatch := subtle.ConstantTimeCompare([]byte(a.pin), []byte(candidate)) == 1
	return tokenMatch || pinMatch
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
