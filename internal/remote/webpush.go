package remote

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

var b64 = base64.RawURLEncoding

type PushKeys struct {
	P256DH string `json:"p256dh"`
	Auth   string `json:"auth"`
}

type PushSubscription struct {
	Endpoint string   `json:"endpoint"`
	Keys     PushKeys `json:"keys"`
}

var errSubscriptionGone = errors.New("push subscription is gone")

type vapidKey struct {
	private *ecdsa.PrivateKey
	public  []byte
}

func newVapidKey() (*vapidKey, error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, err
	}
	return wrapVapidKey(key)
}

func wrapVapidKey(key *ecdsa.PrivateKey) (*vapidKey, error) {
	pub, err := key.PublicKey.ECDH()
	if err != nil {
		return nil, err
	}
	return &vapidKey{private: key, public: pub.Bytes()}, nil
}

func (k *vapidKey) marshal() (string, error) {
	der, err := x509.MarshalPKCS8PrivateKey(k.private)
	if err != nil {
		return "", err
	}
	return b64.EncodeToString(der), nil
}

func parseVapidKey(encoded string) (*vapidKey, error) {
	der, err := b64.DecodeString(encoded)
	if err != nil {
		return nil, err
	}
	parsed, err := x509.ParsePKCS8PrivateKey(der)
	if err != nil {
		return nil, err
	}
	key, ok := parsed.(*ecdsa.PrivateKey)
	if !ok || key.Curve != elliptic.P256() {
		return nil, errors.New("vapid key is not P-256")
	}
	return wrapVapidKey(key)
}

func (k *vapidKey) publicKey() string {
	return b64.EncodeToString(k.public)
}

func (k *vapidKey) authorization(endpoint, subject string, now time.Time) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("bad push endpoint %q", endpoint)
	}
	header := b64.EncodeToString([]byte(`{"typ":"JWT","alg":"ES256"}`))
	claims, err := json.Marshal(map[string]any{
		"aud": u.Scheme + "://" + u.Host,
		"exp": now.Add(12 * time.Hour).Unix(),
		"sub": subject,
	})
	if err != nil {
		return "", err
	}
	signingInput := header + "." + b64.EncodeToString(claims)
	digest := sha256.Sum256([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, k.private, digest[:])
	if err != nil {
		return "", err
	}
	signature := make([]byte, 64)
	r.FillBytes(signature[:32])
	s.FillBytes(signature[32:])
	return "vapid t=" + signingInput + "." + b64.EncodeToString(signature) + ", k=" + k.publicKey(), nil
}

const pushRecordSize = 4096

func encryptPush(sub PushSubscription, payload []byte) ([]byte, error) {
	uaPublic, err := b64.DecodeString(sub.Keys.P256DH)
	if err != nil {
		return nil, fmt.Errorf("bad p256dh: %w", err)
	}
	authSecret, err := b64.DecodeString(sub.Keys.Auth)
	if err != nil {
		return nil, fmt.Errorf("bad auth secret: %w", err)
	}
	receiver, err := ecdh.P256().NewPublicKey(uaPublic)
	if err != nil {
		return nil, fmt.Errorf("bad p256dh: %w", err)
	}
	sender, err := ecdh.P256().GenerateKey(rand.Reader)
	if err != nil {
		return nil, err
	}
	shared, err := sender.ECDH(receiver)
	if err != nil {
		return nil, err
	}
	senderPublic := sender.PublicKey().Bytes()

	salt := make([]byte, 16)
	if _, err := io.ReadFull(rand.Reader, salt); err != nil {
		return nil, err
	}
	return sealPush(payload, shared, authSecret, uaPublic, senderPublic, salt)
}

func sealPush(payload, shared, authSecret, uaPublic, senderPublic, salt []byte) ([]byte, error) {
	if len(payload)+17 > pushRecordSize {
		return nil, errors.New("push payload too large")
	}
	prkKey, err := hkdf.Extract(sha256.New, shared, authSecret)
	if err != nil {
		return nil, err
	}
	keyInfo := "WebPush: info\x00" + string(uaPublic) + string(senderPublic)
	ikm, err := hkdf.Expand(sha256.New, prkKey, keyInfo, 32)
	if err != nil {
		return nil, err
	}
	prk, err := hkdf.Extract(sha256.New, ikm, salt)
	if err != nil {
		return nil, err
	}
	cek, err := hkdf.Expand(sha256.New, prk, "Content-Encoding: aes128gcm\x00", 16)
	if err != nil {
		return nil, err
	}
	nonce, err := hkdf.Expand(sha256.New, prk, "Content-Encoding: nonce\x00", 12)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(cek)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	plaintext := append(append([]byte{}, payload...), 0x02)

	var body bytes.Buffer
	body.Write(salt)
	_ = binary.Write(&body, binary.BigEndian, uint32(pushRecordSize))
	body.WriteByte(byte(len(senderPublic)))
	body.Write(senderPublic)
	body.Write(gcm.Seal(nil, nonce, plaintext, nil))
	return body.Bytes(), nil
}

type pushOptions struct {
	TTL     time.Duration
	Urgency string
	Topic   string
}

func sendPush(ctx context.Context, client *http.Client, key *vapidKey, subject string, sub PushSubscription, payload []byte, opts pushOptions) error {
	body, err := encryptPush(sub, payload)
	if err != nil {
		return err
	}
	auth, err := key.authorization(sub.Endpoint, subject, time.Now())
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, sub.Endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	ttl := opts.TTL
	if ttl <= 0 {
		ttl = 24 * time.Hour
	}
	req.Header.Set("Authorization", auth)
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("TTL", strconv.Itoa(int(ttl.Seconds())))
	if opts.Urgency != "" {
		req.Header.Set("Urgency", opts.Urgency)
	}
	if opts.Topic != "" {
		req.Header.Set("Topic", opts.Topic)
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	detail, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	switch {
	case resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone:
		return errSubscriptionGone
	case resp.StatusCode >= 300:
		return fmt.Errorf("push service answered %d: %s", resp.StatusCode, bytes.TrimSpace(detail))
	}
	return nil
}

func topicFor(threadID string) string {
	sum := sha256.Sum256([]byte(threadID))
	return b64.EncodeToString(sum[:15])
}
