package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestNormalizeWSURL(t *testing.T) {
	cases := []struct {
		in   string
		want string
		err  bool
	}{
		{"localhost:8765", "ws://localhost:8765/", false},
		{"127.0.0.1:9000", "ws://127.0.0.1:9000/", false},
		{"ws://host:1/", "ws://host:1/", false},
		{"wss://host:443/", "wss://host:443/", false},
		{"http://host:80", "ws://host:80/", false},
		{"https://host", "wss://host/", false},
		{"", "", true},
		{"ftp://host", "", true},
	}
	for _, c := range cases {
		got, err := normalizeWSURL(c.in)
		if c.err {
			if err == nil {
				t.Errorf("normalizeWSURL(%q): expected error, got %q", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("normalizeWSURL(%q): unexpected error %v", c.in, err)
			continue
		}
		if got != c.want {
			t.Errorf("normalizeWSURL(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestLoadDaemonConfig_EnvOverridesFile(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	if err := os.WriteFile(cfgPath, []byte(`{"address":"file-host:1111","token":"file-token"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("IG_DAEMON_CONFIG", cfgPath)
	t.Setenv("IG_DAEMON_ADDR", "env-host:2222") // overrides the file address
	t.Setenv("IG_PAIRING_TOKEN", "")            // leave token to the file

	cfg, err := LoadDaemonConfig()
	if err != nil {
		t.Fatalf("LoadDaemonConfig: %v", err)
	}
	if cfg.Address != "env-host:2222" {
		t.Errorf("address = %q, want env override env-host:2222", cfg.Address)
	}
	if cfg.Token != "file-token" {
		t.Errorf("token = %q, want file-token", cfg.Token)
	}
}

func TestLoadDaemonConfig_MissingTokenIsError(t *testing.T) {
	dir := t.TempDir()
	cfgPath := filepath.Join(dir, "config.json")
	// Address only, no token.
	if err := os.WriteFile(cfgPath, []byte(`{"address":"h:1"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Setenv("IG_DAEMON_CONFIG", cfgPath)
	t.Setenv("IG_PAIRING_TOKEN", "")

	if _, err := LoadDaemonConfig(); err == nil {
		t.Errorf("expected error when no token is configured")
	}
}
