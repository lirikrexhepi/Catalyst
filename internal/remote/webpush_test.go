package remote

import (
	"crypto/ecdh"
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/json"
	"math/big"
	"strings"
	"testing"
	"time"
)

func mustB64(t *testing.T, s string) []byte {
	t.Helper()
	out, err := b64.DecodeString(s)
	if err != nil {
		t.Fatalf("decode %q: %v", s, err)
	}
	return out
}

func TestSealPushMatchesRFC8291Example(t *testing.T) {
	sender, err := ecdh.P256().NewPrivateKey(mustB64(t, "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw"))
	if err != nil {
		t.Fatal(err)
	}
	uaPublic := mustB64(t, "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4")
	receiver, err := ecdh.P256().NewPublicKey(uaPublic)
	if err != nil {
		t.Fatal(err)
	}
	shared, err := sender.ECDH(receiver)
	if err != nil {
		t.Fatal(err)
	}
	got, err := sealPush(
		[]byte("When I grow up, I want to be a watermelon"),
		shared,
		mustB64(t, "BTBZMqHH6r4Tts7J_aSIgg"),
		uaPublic,
		sender.PublicKey().Bytes(),
		mustB64(t, "DGv6ra1nlYgDCS1FRnbzlw"),
	)
	if err != nil {
		t.Fatal(err)
	}
	want := "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN"
	if b64.EncodeToString(got) != want {
		t.Fatalf("ciphertext mismatch\n got %s\nwant %s", b64.EncodeToString(got), want)
	}
}

func TestVapidAuthorizationIsAValidES256Token(t *testing.T) {
	key, err := newVapidKey()
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := key.marshal()
	if err != nil {
		t.Fatal(err)
	}
	reloaded, err := parseVapidKey(encoded)
	if err != nil {
		t.Fatal(err)
	}
	if reloaded.publicKey() != key.publicKey() {
		t.Fatal("key did not survive a save and load")
	}

	now := time.Unix(1_800_000_000, 0)
	header, err := reloaded.authorization("https://web.push.apple.com/QGuQyavXutnMH/abc", "https://pc.example.ts.net", now)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(header, "vapid t=") || !strings.HasSuffix(header, ", k="+key.publicKey()) {
		t.Fatalf("unexpected header shape: %s", header)
	}
	token := strings.TrimSuffix(strings.TrimPrefix(header, "vapid t="), ", k="+key.publicKey())
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		t.Fatalf("token has %d parts", len(parts))
	}
	var claims map[string]any
	if err := json.Unmarshal(mustB64(t, parts[1]), &claims); err != nil {
		t.Fatal(err)
	}
	if claims["aud"] != "https://web.push.apple.com" || claims["sub"] != "https://pc.example.ts.net" {
		t.Fatalf("claims = %v", claims)
	}
	if exp := int64(claims["exp"].(float64)); exp <= now.Unix() || exp > now.Add(24*time.Hour).Unix() {
		t.Fatalf("exp %d out of range", exp)
	}
	sig := mustB64(t, parts[2])
	digest := sha256.Sum256([]byte(parts[0] + "." + parts[1]))
	r, s := new(big.Int).SetBytes(sig[:32]), new(big.Int).SetBytes(sig[32:])
	if !ecdsa.Verify(&key.private.PublicKey, digest[:], r, s) {
		t.Fatal("signature does not verify")
	}
}
