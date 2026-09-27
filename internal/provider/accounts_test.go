package provider

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"composer/internal/domain"
	"composer/internal/shell"
)

type accountDriver struct {
	stubDriver
	defaultDir string
	built      []domain.ProviderSettings
}

func (d *accountDriver) NewAdapter(settings domain.ProviderSettings, emit Emitter) (Adapter, error) {
	d.built = append(d.built, settings)
	return nil, nil
}

func (d *accountDriver) Binary(settings domain.ProviderSettings) string { return "fake-cli" }

func (d *accountDriver) AccountEnv(dir string) map[string]string {
	return map[string]string{"FAKE_CONFIG_DIR": dir}
}

func (d *accountDriver) AccountUnset() []string {
	return []string{"FAKE_CONFIG_DIR", "FAKE_TOKEN"}
}

func (d *accountDriver) DefaultConfigDir(env map[string]string) string { return d.defaultDir }

func (d *accountDriver) SharedSettings() []string {
	return []string{"CLAUDE.md", "settings.json", "skills", ".credentials.json", "projects", "../escape"}
}

func (d *accountDriver) SignInArgs() []string { return []string{"auth", "login"} }

func (d *accountDriver) StatusArgs() []string { return []string{"auth", "status"} }

func (d *accountDriver) ParseStatus(result CommandResult) AccountStatus { return AccountStatus{} }

func newAccountRegistry(t *testing.T) (*Registry, *accountDriver, string) {
	t.Helper()
	root := t.TempDir()
	driver := &accountDriver{stubDriver: stubDriver{kind: domain.DriverClaude}}
	registry := NewRegistry(driver, stubDriver{kind: domain.DriverCodex})
	registry.UseAccounts(NewAccounts(root))
	return registry, driver, root
}

func TestAccountsStartWithOnlyTheDefault(t *testing.T) {
	registry, _, _ := newAccountRegistry(t)
	accounts := registry.Accounts(domain.DriverClaude)
	if len(accounts) != 1 || accounts[0].ID != domain.DefaultAccountID || accounts[0].Name != "Default" || accounts[0].ConfigDir != "" {
		t.Fatalf("expected only the implicit default account, got %+v", accounts)
	}
	if registry.SupportsAccounts(domain.DriverCodex) {
		t.Fatal("a driver without account support must stay single-account")
	}
	if got := registry.Accounts(domain.DriverCodex); len(got) != 1 || !got[0].IsDefault() {
		t.Fatalf("single-account driver should report just the default, got %+v", got)
	}
}

func TestAddedAccountGetsItsOwnFolderAndSurvivesRestart(t *testing.T) {
	root := t.TempDir()
	store := NewAccounts(root)
	added, err := store.Add(domain.DriverClaude, "Personal")
	if err != nil {
		t.Fatalf("Add: %v", err)
	}
	want := filepath.Join(root, "accounts", "claude-personal")
	if added.ID != "personal" || added.ConfigDir != want {
		t.Fatalf("unexpected account %+v, want folder %s", added, want)
	}
	if info, err := os.Stat(want); err != nil || !info.IsDir() {
		t.Fatalf("account folder was not created: %v", err)
	}
	if err := store.Rename(domain.DriverClaude, domain.DefaultAccountID, "Work"); err != nil {
		t.Fatalf("Rename default: %v", err)
	}

	reopened := NewAccounts(root)
	list := reopened.List(domain.DriverClaude)
	if len(list) != 2 || list[0].Name != "Work" || list[0].ConfigDir != "" || list[1].ID != "personal" || list[1].ConfigDir != want {
		t.Fatalf("accounts lost across restart: %+v", list)
	}
}

func TestAccountNamesAreUniqueAndDefaultIsPermanent(t *testing.T) {
	store := NewAccounts(t.TempDir())
	if _, err := store.Add(domain.DriverClaude, "Personal"); err != nil {
		t.Fatalf("Add: %v", err)
	}
	if _, err := store.Add(domain.DriverClaude, "personal"); !errors.Is(err, ErrAccountNameTaken) {
		t.Fatalf("duplicate name should be refused, got %v", err)
	}
	if _, err := store.Add(domain.DriverClaude, "default"); !errors.Is(err, ErrAccountNameTaken) {
		t.Fatalf("the default account's name should be taken, got %v", err)
	}
	if _, err := store.Add(domain.DriverClaude, "  "); !errors.Is(err, ErrAccountName) {
		t.Fatalf("blank name should be refused, got %v", err)
	}
	second, err := store.Add(domain.DriverClaude, "Personal!")
	if err != nil || second.ID != "personal-2" {
		t.Fatalf("a distinct name with a clashing slug needs its own id, got %q (%v)", second.ID, err)
	}
	other, err := store.Add(domain.DriverClaude, "Side project")
	if err != nil || other.ID != "side-project" {
		t.Fatalf("unexpected id %q (%v)", other.ID, err)
	}
	if err := store.Remove(domain.DriverClaude, domain.DefaultAccountID); !errors.Is(err, ErrDefaultAccount) {
		t.Fatalf("default account must not be removable, got %v", err)
	}
	if err := store.Remove(domain.DriverClaude, "personal"); err != nil {
		t.Fatalf("Remove: %v", err)
	}
	if _, ok := store.Get(domain.DriverClaude, "personal"); ok {
		t.Fatal("removed account is still listed")
	}
	if _, ok := store.Get(domain.DriverOpenCode, "side-project"); ok {
		t.Fatal("accounts must be per driver")
	}
}

func TestDefaultAccountLaunchesExactlyAsBefore(t *testing.T) {
	registry, _, _ := newAccountRegistry(t)
	stored := domain.ProviderSettings{Enabled: true, Env: map[string]string{"FAKE_TOKEN": "keep", "HTTPS_PROXY": "p"}}
	if err := registry.SetSettings(domain.DriverClaude, stored); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{"", domain.DefaultAccountID} {
		settings, err := registry.LaunchSettings(domain.DriverClaude, id)
		if err != nil {
			t.Fatalf("LaunchSettings(%q): %v", id, err)
		}
		if _, set := settings.Env["FAKE_CONFIG_DIR"]; set {
			t.Fatalf("default account must not set a config dir, got %+v", settings.Env)
		}
		if settings.Env["FAKE_TOKEN"] != "keep" || len(settings.Unset) != 0 {
			t.Fatalf("default account settings changed: %+v", settings)
		}
	}
}

func TestAddedAccountSetsItsDirAndNeverInheritsTokens(t *testing.T) {
	registry, _, _ := newAccountRegistry(t)
	if err := registry.SetSettings(domain.DriverClaude, domain.ProviderSettings{
		Enabled: true,
		Env:     map[string]string{"fake_token": "work-token", "HTTPS_PROXY": "p", "FAKE_CONFIG_DIR": "elsewhere"},
	}); err != nil {
		t.Fatal(err)
	}
	account, err := registry.AccountStore().Add(domain.DriverClaude, "Personal")
	if err != nil {
		t.Fatal(err)
	}

	shell.SetAmbient(map[string]string{"FAKE_TOKEN": "ambient-token", "FAKE_CONFIG_DIR": "ambient-dir"})
	t.Cleanup(func() { shell.SetAmbient(nil) })

	settings, err := registry.LaunchSettings(domain.DriverClaude, account.ID)
	if err != nil {
		t.Fatalf("LaunchSettings: %v", err)
	}
	if settings.Env["FAKE_CONFIG_DIR"] != account.ConfigDir {
		t.Fatalf("config dir = %q, want %q", settings.Env["FAKE_CONFIG_DIR"], account.ConfigDir)
	}
	if settings.Env["HTTPS_PROXY"] != "p" {
		t.Fatal("unrelated provider env should still apply to every account")
	}
	env := LaunchEnv(settings)
	for key, value := range env {
		if strings.EqualFold(key, "FAKE_TOKEN") {
			t.Fatalf("a token leaked into the account's environment: %s=%s", key, value)
		}
	}
	if env["FAKE_CONFIG_DIR"] != account.ConfigDir {
		t.Fatalf("ambient config dir overrode the account's: %q", env["FAKE_CONFIG_DIR"])
	}

	defaultEnv := LaunchEnv(registry.Settings(domain.DriverClaude))
	if defaultEnv["FAKE_TOKEN"] != "ambient-token" && defaultEnv["fake_token"] != "work-token" {
		t.Fatalf("default account lost its environment: %+v", defaultEnv)
	}
}

func TestUnknownAccountIsRefusedRatherThanFallingBack(t *testing.T) {
	registry, driver, _ := newAccountRegistry(t)
	if _, err := registry.NewAdapter(domain.DriverClaude, "gone", nil); err == nil {
		t.Fatal("a removed account must not silently run on another account")
	}
	if len(driver.built) != 0 {
		t.Fatal("no adapter should be built for an unknown account")
	}
	if got := registry.ResolveAccount(domain.DriverClaude, "gone", ""); got != domain.DefaultAccountID {
		t.Fatalf("a stale preference should resolve to the default, got %q", got)
	}
}

func TestNewAdapterPassesAccountSettings(t *testing.T) {
	registry, driver, _ := newAccountRegistry(t)
	account, err := registry.AccountStore().Add(domain.DriverClaude, "Personal")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := registry.NewAdapter(domain.DriverClaude, "", nil); err != nil {
		t.Fatal(err)
	}
	if _, err := registry.NewAdapter(domain.DriverClaude, account.ID, nil); err != nil {
		t.Fatal(err)
	}
	if len(driver.built) != 2 {
		t.Fatalf("expected two adapters, got %d", len(driver.built))
	}
	if _, set := driver.built[0].Env["FAKE_CONFIG_DIR"]; set {
		t.Fatal("default adapter got a config dir")
	}
	if driver.built[1].Env["FAKE_CONFIG_DIR"] != account.ConfigDir {
		t.Fatalf("account adapter env = %+v", driver.built[1].Env)
	}
}

func TestSnapshotListsAccounts(t *testing.T) {
	registry, _, _ := newAccountRegistry(t)
	first := registry.Probe(context.Background(), false)
	if _, err := registry.AccountStore().Add(domain.DriverClaude, "Personal"); err != nil {
		t.Fatal(err)
	}
	second := registry.Probe(context.Background(), false)
	for _, snapshot := range first {
		if snapshot.Driver == domain.DriverClaude && len(snapshot.Accounts) != 1 {
			t.Fatalf("expected the default account only, got %+v", snapshot.Accounts)
		}
		if snapshot.Driver == domain.DriverCodex && len(snapshot.Accounts) != 0 {
			t.Fatal("single-account drivers should not advertise accounts")
		}
	}
	for _, snapshot := range second {
		if snapshot.Driver == domain.DriverClaude && len(snapshot.Accounts) != 2 {
			t.Fatalf("a cached snapshot must still show a newly added account, got %+v", snapshot.Accounts)
		}
	}
}

func TestExistingProvidersFileNeedsNoMigration(t *testing.T) {
	root := t.TempDir()
	fixture := `{
  "claude": {
    "binaryPath": "C:\\tools\\claude.exe",
    "env": {"HTTPS_PROXY": "http://proxy"},
    "model": "claude-opus-4-8",
    "enabled": true
  },
  "codex": {
    "enabled": false
  }
}`
	path := filepath.Join(root, "providers.json")
	if err := os.WriteFile(path, []byte(fixture), 0o644); err != nil {
		t.Fatal(err)
	}

	registry, _, _ := newAccountRegistry(t)
	registry.UsePrefs(NewPrefs(root))
	registry.UseAccounts(NewAccounts(root))

	settings, err := registry.LaunchSettings(domain.DriverClaude, "")
	if err != nil {
		t.Fatal(err)
	}
	if settings.BinaryPath != `C:\tools\claude.exe` || settings.Model != "claude-opus-4-8" || !settings.Enabled || settings.Env["HTTPS_PROXY"] != "http://proxy" {
		t.Fatalf("stored settings were not applied: %+v", settings)
	}
	if accounts := registry.Accounts(domain.DriverClaude); len(accounts) != 1 || !accounts[0].IsDefault() {
		t.Fatalf("existing installs should start with only the default account: %+v", accounts)
	}
	if _, err := registry.AccountStore().Add(domain.DriverClaude, "Personal"); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(after) != fixture {
		t.Fatalf("providers.json must not be rewritten by accounts:\n%s", after)
	}
	if _, err := os.Stat(filepath.Join(root, "accounts.json")); err != nil {
		t.Fatalf("accounts should live in their own file: %v", err)
	}
}

func TestCopySettingsSkipsCredentialsAndHistory(t *testing.T) {
	registry, driver, _ := newAccountRegistry(t)
	source := t.TempDir()
	driver.defaultDir = source
	files := map[string]string{
		"CLAUDE.md":                       "memory",
		"settings.json":                   `{"theme":"dark"}`,
		"skills/review/SKILL.md":          "skill",
		"skills/review/.credentials.json": "nested secret",
		".credentials.json":               "secret",
		"projects/p/session.jsonl":        "history",
		"history.jsonl":                   "history",
	}
	for name, content := range files {
		target := filepath.Join(source, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(target, []byte(content), 0o600); err != nil {
			t.Fatal(err)
		}
	}
	account, err := registry.AccountStore().Add(domain.DriverClaude, "Personal")
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(account.ConfigDir, "settings.json"), []byte("mine"), 0o600); err != nil {
		t.Fatal(err)
	}

	copied, err := registry.CopyDefaultSettings(domain.DriverClaude, account.ID)
	if err != nil {
		t.Fatalf("CopyDefaultSettings: %v", err)
	}
	if strings.Join(copied, ",") != "CLAUDE.md,settings.json,skills" {
		t.Fatalf("copied = %v", copied)
	}
	read := func(name string) (string, bool) {
		raw, err := os.ReadFile(filepath.Join(account.ConfigDir, filepath.FromSlash(name)))
		return string(raw), err == nil
	}
	if got, _ := read("CLAUDE.md"); got != "memory" {
		t.Fatalf("CLAUDE.md = %q", got)
	}
	if got, _ := read("settings.json"); got != "mine" {
		t.Fatalf("an account's own settings must not be overwritten, got %q", got)
	}
	if got, _ := read("skills/review/SKILL.md"); got != "skill" {
		t.Fatalf("skills were not copied: %q", got)
	}
	for _, never := range []string{".credentials.json", "skills/review/.credentials.json", "projects/p/session.jsonl", "history.jsonl"} {
		if _, ok := read(never); ok {
			t.Fatalf("%s must never be copied into another account", never)
		}
	}
	if _, err := registry.CopyDefaultSettings(domain.DriverClaude, domain.DefaultAccountID); err == nil {
		t.Fatal("copying into the default account should be refused")
	}
}
