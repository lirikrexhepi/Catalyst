package remote

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/binary"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"composer/internal/domain"
)

type fakePhone struct {
	private *ecdh.PrivateKey
	auth    []byte
}

func newFakePhone(t *testing.T) *fakePhone {
	t.Helper()
	key, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	auth := make([]byte, 16)
	_, _ = rand.Read(auth)
	return &fakePhone{private: key, auth: auth}
}

func (p *fakePhone) subscription(endpoint string) PushSubscription {
	return PushSubscription{Endpoint: endpoint, Keys: PushKeys{
		P256DH: b64.EncodeToString(p.private.PublicKey().Bytes()),
		Auth:   b64.EncodeToString(p.auth),
	}}
}

func (p *fakePhone) open(t *testing.T, body []byte) pushMessage {
	t.Helper()
	salt := body[:16]
	idLen := int(body[20])
	senderPublic := body[21 : 21+idLen]
	if rs := binary.BigEndian.Uint32(body[16:20]); rs != pushRecordSize {
		t.Fatalf("record size %d", rs)
	}
	sender, err := ecdh.P256().NewPublicKey(senderPublic)
	if err != nil {
		t.Fatal(err)
	}
	shared, err := p.private.ECDH(sender)
	if err != nil {
		t.Fatal(err)
	}
	prkKey, _ := hkdf.Extract(sha256.New, shared, p.auth)
	ikm, _ := hkdf.Expand(sha256.New, prkKey, "WebPush: info\x00"+string(p.private.PublicKey().Bytes())+string(senderPublic), 32)
	prk, _ := hkdf.Extract(sha256.New, ikm, salt)
	cek, _ := hkdf.Expand(sha256.New, prk, "Content-Encoding: aes128gcm\x00", 16)
	nonce, _ := hkdf.Expand(sha256.New, prk, "Content-Encoding: nonce\x00", 12)
	block, _ := aes.NewCipher(cek)
	gcm, _ := cipher.NewGCM(block)
	plain, err := gcm.Open(nil, nonce, body[21+idLen:], nil)
	if err != nil {
		t.Fatalf("phone could not decrypt: %v", err)
	}
	plain = bytes.TrimSuffix(plain, []byte{0x02})
	var msg pushMessage
	if err := json.Unmarshal(plain, &msg); err != nil {
		t.Fatal(err)
	}
	return msg
}

type pushService struct {
	mu       sync.Mutex
	requests []*http.Request
	bodies   [][]byte
	status   int
	server   *httptest.Server
}

func newPushService(t *testing.T) *pushService {
	svc := &pushService{status: http.StatusCreated}
	svc.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		svc.mu.Lock()
		svc.requests = append(svc.requests, r)
		svc.bodies = append(svc.bodies, body)
		status := svc.status
		svc.mu.Unlock()
		w.WriteHeader(status)
	}))
	t.Cleanup(svc.server.Close)
	return svc
}

func (svc *pushService) count() int {
	svc.mu.Lock()
	defer svc.mu.Unlock()
	return len(svc.bodies)
}

func (svc *pushService) waitFor(t *testing.T, n int) {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for svc.count() < n && time.Now().Before(deadline) {
		time.Sleep(10 * time.Millisecond)
	}
	if got := svc.count(); got < n {
		t.Fatalf("want %d pushes, got %d", n, got)
	}
}

func newTestNotifier(t *testing.T) (*Notifier, *fakePhone, *pushService) {
	t.Helper()
	old := notifySettle
	notifySettle = 10 * time.Millisecond
	t.Cleanup(func() { notifySettle = old })

	n := NewNotifier()
	if err := n.Load(filepath.Join(t.TempDir(), "push.json")); err != nil {
		t.Fatal(err)
	}
	n.idle = func() (time.Duration, bool) { return time.Hour, true }
	n.summaries = func() []ThreadSummary {
		return []ThreadSummary{
			{ThreadID: "t1", Title: "Fix login bug"},
			{ThreadID: "t2", Title: "Other", Attention: "approval"},
		}
	}
	phone := newFakePhone(t)
	svc := newPushService(t)
	if err := n.Subscribe(phone.subscription(svc.server.URL+"/push/abc"), PushPrefs{Attention: true, Finished: true, Away: true}, "iPhone"); err != nil {
		t.Fatal(err)
	}
	return n, phone, svc
}

func TestFinishedTurnSendsCleanNotification(t *testing.T) {
	n, phone, svc := newTestNotifier(t)
	n.observe(domain.RuntimeEvent{Kind: domain.EventTurnStarted, ThreadID: "t1", TurnID: "u1"})
	n.observe(domain.RuntimeEvent{Kind: domain.EventAgentMessage, ThreadID: "t1", TurnID: "u1", ItemID: "a", Delta: true, Text: "Looking into it."})
	n.observe(domain.RuntimeEvent{Kind: domain.EventAgentMessage, ThreadID: "t1", TurnID: "u1", ItemID: "b", Delta: true, Text: "Fixed the **token refresh** in "})
	n.observe(domain.RuntimeEvent{Kind: domain.EventAgentMessage, ThreadID: "t1", TurnID: "u1", ItemID: "b", Delta: true, Text: "[auth.ts](file:///C:/x/auth.ts)."})
	n.observe(domain.RuntimeEvent{Kind: domain.EventTurnCompleted, ThreadID: "t1", TurnID: "u1"})
	svc.waitFor(t, 1)

	msg := phone.open(t, svc.bodies[0])
	if msg.Title != "Fix login bug" || msg.Body != "Fixed the token refresh in auth.ts." {
		t.Fatalf("got %+v", msg)
	}
	if msg.URL != "/#/t/t1" || msg.Tag != "t1" || msg.Badge != 1 || msg.Kind != "finished" {
		t.Fatalf("got %+v", msg)
	}
	req := svc.requests[0]
	if req.Header.Get("Content-Encoding") != "aes128gcm" || !strings.HasPrefix(req.Header.Get("Authorization"), "vapid t=") || req.Header.Get("TTL") == "" {
		t.Fatalf("headers %v", req.Header)
	}
}

func TestApprovalIsUrgent(t *testing.T) {
	n, phone, svc := newTestNotifier(t)
	n.observe(domain.RuntimeEvent{Kind: domain.EventApprovalRequest, ThreadID: "t1", Approval: &domain.ApprovalRequest{RequestID: "r", Title: "Run npm run build"}})
	svc.waitFor(t, 1)
	msg := phone.open(t, svc.bodies[0])
	if msg.Body != "Needs your approval · Run npm run build" || msg.Kind != "attention" {
		t.Fatalf("got %+v", msg)
	}
	if svc.requests[0].Header.Get("Urgency") != "high" {
		t.Fatalf("urgency %q", svc.requests[0].Header.Get("Urgency"))
	}
}

func TestQuietWhenWatchingAtThePCOrCancelled(t *testing.T) {
	cases := map[string]struct {
		setup func(n *Notifier)
		event domain.RuntimeEvent
	}{
		"watching that chat": {
			setup: func(n *Notifier) { n.viewing = func(threadID string) bool { return threadID == "t1" } },
			event: domain.RuntimeEvent{Kind: domain.EventTurnCompleted, ThreadID: "t1"},
		},
		"using the PC": {
			setup: func(n *Notifier) { n.idle = func() (time.Duration, bool) { return 10 * time.Second, true } },
			event: domain.RuntimeEvent{Kind: domain.EventTurnCompleted, ThreadID: "t1"},
		},
		"interrupted": {
			setup: func(n *Notifier) {},
			event: domain.RuntimeEvent{Kind: domain.EventTurnCompleted, ThreadID: "t1", StopReason: domain.StopCancelled},
		},
	}
	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			n, _, svc := newTestNotifier(t)
			tc.setup(n)
			n.observe(tc.event)
			time.Sleep(150 * time.Millisecond)
			if got := svc.count(); got != 0 {
				t.Fatalf("want no pushes, got %d", got)
			}
		})
	}
}

func TestGoneSubscriptionIsDropped(t *testing.T) {
	n, _, svc := newTestNotifier(t)
	svc.mu.Lock()
	svc.status = http.StatusGone
	svc.mu.Unlock()
	n.observe(domain.RuntimeEvent{Kind: domain.EventTurnFailed, ThreadID: "t1", Error: "boom"})
	svc.waitFor(t, 1)
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		n.mu.Lock()
		left := len(n.devices)
		n.mu.Unlock()
		if left == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("expired subscription was kept")
}

func TestSubscriptionsSurviveRestart(t *testing.T) {
	path := filepath.Join(t.TempDir(), "push.json")
	first := NewNotifier()
	if err := first.Load(path); err != nil {
		t.Fatal(err)
	}
	phone := newFakePhone(t)
	if err := first.Subscribe(phone.subscription("https://push.example/x"), PushPrefs{Finished: true}, "iPhone"); err != nil {
		t.Fatal(err)
	}
	key, _ := first.PublicKey()

	second := NewNotifier()
	if err := second.Load(path); err != nil {
		t.Fatal(err)
	}
	if got, _ := second.PublicKey(); got != key {
		t.Fatal("VAPID key changed across restart, phones would need to resubscribe")
	}
	if len(second.devices) != 1 {
		t.Fatalf("want 1 device, got %d", len(second.devices))
	}
}
