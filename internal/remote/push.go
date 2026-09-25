package remote

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"composer/internal/domain"
	"composer/internal/logger"
)

type PushPrefs struct {
	Attention bool `json:"attention"`
	Finished  bool `json:"finished"`
	Away      bool `json:"away"`
}

type pushDevice struct {
	Subscription PushSubscription `json:"subscription"`
	Prefs        PushPrefs        `json:"prefs"`
	Device       string           `json:"device,omitempty"`
	CreatedAt    int64            `json:"createdAt"`
}

type pushFile struct {
	Key     string       `json:"key"`
	Devices []pushDevice `json:"devices"`
}

type pushMessage struct {
	Title string `json:"title"`
	Body  string `json:"body"`
	URL   string `json:"url"`
	Tag   string `json:"tag"`
	Badge int    `json:"badge"`
	Kind  string `json:"kind"`
}

type turnTrack struct {
	item string
	text strings.Builder
}

var notifySettle = 400 * time.Millisecond

const (
	awayAfter      = 2 * time.Minute
	pushBodyLimit  = 180
	pushSendBudget = 20 * time.Second
)

type Notifier struct {
	mu      sync.Mutex
	path    string
	key     *vapidKey
	devices map[string]*pushDevice
	turns   map[string]*turnTrack
	client  *http.Client

	subject   func() string
	summaries func() []ThreadSummary
	viewing   func(threadID string) bool
	idle      func() (time.Duration, bool)
}

func NewNotifier() *Notifier {
	return &Notifier{
		devices: make(map[string]*pushDevice),
		turns:   make(map[string]*turnTrack),
		client:  &http.Client{Timeout: 15 * time.Second},
		idle:    userIdle,
	}
}

func (n *Notifier) Load(path string) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	n.path = path
	var saved pushFile
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &saved)
	}
	if saved.Key != "" {
		if key, err := parseVapidKey(saved.Key); err == nil {
			n.key = key
		}
	}
	n.devices = make(map[string]*pushDevice)
	for i := range saved.Devices {
		d := saved.Devices[i]
		if d.Subscription.Endpoint != "" {
			n.devices[d.Subscription.Endpoint] = &d
		}
	}
	if n.key == nil {
		key, err := newVapidKey()
		if err != nil {
			return err
		}
		n.key = key
		return n.saveLocked()
	}
	return nil
}

func (n *Notifier) ensureKeyLocked() error {
	if n.key != nil {
		return nil
	}
	key, err := newVapidKey()
	if err != nil {
		return err
	}
	n.key = key
	return nil
}

func (n *Notifier) saveLocked() error {
	if n.path == "" || n.key == nil {
		return nil
	}
	encoded, err := n.key.marshal()
	if err != nil {
		return err
	}
	out := pushFile{Key: encoded}
	for _, d := range n.devices {
		out.Devices = append(out.Devices, *d)
	}
	data, err := json.MarshalIndent(out, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(n.path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(n.path, data, 0o600)
}

func (n *Notifier) PublicKey() (string, error) {
	n.mu.Lock()
	defer n.mu.Unlock()
	if err := n.ensureKeyLocked(); err != nil {
		return "", err
	}
	return n.key.publicKey(), nil
}

func (n *Notifier) Subscribe(sub PushSubscription, prefs PushPrefs, device string) error {
	if sub.Endpoint == "" || sub.Keys.P256DH == "" || sub.Keys.Auth == "" {
		return errors.New("subscription is missing its endpoint or keys")
	}
	n.mu.Lock()
	defer n.mu.Unlock()
	if err := n.ensureKeyLocked(); err != nil {
		return err
	}
	created := time.Now().UnixMilli()
	if existing, ok := n.devices[sub.Endpoint]; ok {
		created = existing.CreatedAt
	}
	n.devices[sub.Endpoint] = &pushDevice{Subscription: sub, Prefs: prefs, Device: device, CreatedAt: created}
	return n.saveLocked()
}

func (n *Notifier) Unsubscribe(endpoint string) error {
	n.mu.Lock()
	defer n.mu.Unlock()
	if _, ok := n.devices[endpoint]; !ok {
		return nil
	}
	delete(n.devices, endpoint)
	return n.saveLocked()
}

func (n *Notifier) Test(ctx context.Context, endpoint string) error {
	n.mu.Lock()
	device, ok := n.devices[endpoint]
	var target pushDevice
	if ok {
		target = *device
	}
	n.mu.Unlock()
	if !ok {
		return errors.New("this phone is not subscribed")
	}
	msg := pushMessage{
		Title: "Orchestrator",
		Body:  "Notifications are on. You'll hear from your agents here.",
		URL:   "/",
		Tag:   "test",
		Badge: n.badgeCount(),
		Kind:  "test",
	}
	return n.deliver(ctx, target, msg, "normal")
}

func (n *Notifier) Run(events <-chan domain.RuntimeEvent) {
	for event := range events {
		n.observe(event)
	}
}

func (n *Notifier) observe(event domain.RuntimeEvent) {
	if event.ThreadID == "" {
		return
	}
	switch event.Kind {
	case domain.EventTurnStarted:
		n.mu.Lock()
		n.turns[event.ThreadID] = &turnTrack{}
		n.mu.Unlock()
	case domain.EventAgentMessage:
		n.mu.Lock()
		track := n.turns[event.ThreadID]
		if track == nil {
			track = &turnTrack{}
			n.turns[event.ThreadID] = track
		}
		key := event.TurnID + "|" + event.ItemID
		if !event.Delta || key != track.item {
			track.text.Reset()
			track.item = key
		}
		if track.text.Len() < 8192 {
			track.text.WriteString(event.Text)
		}
		n.mu.Unlock()
	case domain.EventApprovalRequest:
		body := "Needs your approval"
		if a := event.Approval; a != nil {
			body = joinNonEmpty(" · ", "Needs your approval", firstNonEmpty(a.Title, a.Detail))
		}
		n.schedule(event.ThreadID, "attention", body, "high")
	case domain.EventQuestionAsked:
		body := "Has a question for you"
		if q := event.Question; q != nil && len(q.Questions) > 0 {
			body = q.Questions[0].Question
		}
		n.schedule(event.ThreadID, "attention", body, "high")
	case domain.EventTurnCompleted:
		if event.StopReason == domain.StopCancelled {
			n.forget(event.ThreadID)
			return
		}
		n.mu.Lock()
		text := ""
		if track := n.turns[event.ThreadID]; track != nil {
			text = track.text.String()
		}
		delete(n.turns, event.ThreadID)
		n.mu.Unlock()
		body := plainPreview(text)
		if body == "" {
			body = "Finished"
		}
		n.schedule(event.ThreadID, "finished", body, "normal")
	case domain.EventTurnFailed:
		n.forget(event.ThreadID)
		n.schedule(event.ThreadID, "finished", joinNonEmpty(" · ", "Stopped with an error", plainPreview(event.Error)), "normal")
	case domain.EventSessionStopped:
		n.forget(event.ThreadID)
	}
}

func (n *Notifier) forget(threadID string) {
	n.mu.Lock()
	delete(n.turns, threadID)
	n.mu.Unlock()
}

func (n *Notifier) schedule(threadID, kind, body, urgency string) {
	n.mu.Lock()
	targets := make([]pushDevice, 0, len(n.devices))
	for _, d := range n.devices {
		if (kind == "attention" && d.Prefs.Attention) || (kind == "finished" && d.Prefs.Finished) {
			targets = append(targets, *d)
		}
	}
	n.mu.Unlock()
	if len(targets) == 0 {
		return
	}
	go func() {
		time.Sleep(notifySettle)
		if n.viewing != nil && n.viewing(threadID) {
			return
		}
		atPC := false
		if idle, ok := n.idle(); ok && idle < awayAfter {
			atPC = true
		}
		title, badge := n.describe(threadID)
		msg := pushMessage{
			Title: title,
			Body:  truncateRunes(body, pushBodyLimit),
			URL:   "/#/t/" + threadID,
			Tag:   threadID,
			Badge: badge,
			Kind:  kind,
		}
		ctx, cancel := context.WithTimeout(context.Background(), pushSendBudget)
		defer cancel()
		for _, target := range targets {
			if target.Prefs.Away && atPC {
				continue
			}
			if err := n.deliver(ctx, target, msg, urgency); err != nil {
				logger.Errorf("Push", "Notification to %s failed: %v", target.Device, err)
			}
		}
	}()
}

func (n *Notifier) deliver(ctx context.Context, target pushDevice, msg pushMessage, urgency string) error {
	payload, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	n.mu.Lock()
	key := n.key
	n.mu.Unlock()
	if key == nil {
		return errors.New("no push key")
	}
	subject := "mailto:orchestrator@users.noreply.github.com"
	if n.subject != nil {
		if s := n.subject(); strings.HasPrefix(s, "https://") {
			subject = s
		}
	}
	err = sendPush(ctx, n.client, key, subject, target.Subscription, payload, pushOptions{
		TTL:     24 * time.Hour,
		Urgency: urgency,
		Topic:   topicFor(msg.Tag),
	})
	if errors.Is(err, errSubscriptionGone) {
		logger.Infof("Push", "Dropping expired subscription for %s", target.Device)
		_ = n.Unsubscribe(target.Subscription.Endpoint)
	}
	return err
}

func (n *Notifier) describe(threadID string) (string, int) {
	if n.summaries == nil {
		return "Orchestrator", 0
	}
	title := "Orchestrator"
	badge := 0
	for _, row := range n.summaries() {
		if row.Attention != "" {
			badge++
		}
		if row.ThreadID == threadID && row.Title != "" {
			title = row.Title
		}
	}
	return title, badge
}

func (n *Notifier) badgeCount() int {
	_, badge := n.describe("")
	return badge
}

var (
	markdownLink   = regexp.MustCompile(`\[([^\]]*)\]\([^)]*\)`)
	markdownMarks  = regexp.MustCompile("(\\*\\*|`+|^#+\\s*|^>\\s*|^[-*]\\s+)")
	collapseSpaces = regexp.MustCompile(`\s+`)
)

func plainPreview(text string) string {
	lines := strings.Split(strings.TrimSpace(text), "\n")
	for i, line := range lines {
		lines[i] = markdownMarks.ReplaceAllString(strings.TrimSpace(line), "")
	}
	out := markdownLink.ReplaceAllString(strings.Join(lines, " "), "$1")
	return strings.TrimSpace(collapseSpaces.ReplaceAllString(out, " "))
}

func truncateRunes(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}
	return strings.TrimSpace(string(runes[:limit-1])) + "…"
}

func joinNonEmpty(sep string, parts ...string) string {
	kept := parts[:0:0]
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			kept = append(kept, p)
		}
	}
	return strings.Join(kept, sep)
}

func deviceName(userAgent string) string {
	switch {
	case strings.Contains(userAgent, "iPhone"):
		return "iPhone"
	case strings.Contains(userAgent, "iPad"):
		return "iPad"
	case strings.Contains(userAgent, "Android"):
		return "Android"
	default:
		return "Phone"
	}
}
