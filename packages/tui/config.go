package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// DaemonConfig is how the TUI reaches the daemon: a network address and the
// per-instance pairing token the daemon validates at the WS handshake.
type DaemonConfig struct {
	Address string `json:"address"` // host:port, or a full ws://, wss://, http://, https:// URL
	Token   string `json:"token"`
}

// LoadDaemonConfig resolves the daemon address + pairing token. Precedence, low to
// high: built-in default address → optional JSON config file → environment. The
// token has no default (fail fast if missing) — an unauthenticated dial is useless
// because the daemon rejects it.
//
// Config file location: IG_DAEMON_CONFIG, else ./daemon.config.json, else
// <user-config-dir>/instagram-cli/config.json. Env overrides: IG_DAEMON_ADDR,
// IG_PAIRING_TOKEN.
func LoadDaemonConfig() (DaemonConfig, error) {
	cfg := DaemonConfig{Address: "localhost:8765"}

	if path := configFilePath(); path != "" {
		data, err := os.ReadFile(path)
		if err != nil {
			return cfg, fmt.Errorf("read daemon config %s: %w", path, err)
		}
		var fileCfg DaemonConfig
		if err := json.Unmarshal(data, &fileCfg); err != nil {
			return cfg, fmt.Errorf("parse daemon config %s: %w", path, err)
		}
		if fileCfg.Address != "" {
			cfg.Address = fileCfg.Address
		}
		if fileCfg.Token != "" {
			cfg.Token = fileCfg.Token
		}
	}

	if v := os.Getenv("IG_DAEMON_ADDR"); v != "" {
		cfg.Address = v
	}
	if v := os.Getenv("IG_PAIRING_TOKEN"); v != "" {
		cfg.Token = v
	}

	if cfg.Token == "" {
		return cfg, fmt.Errorf("no pairing token configured: set IG_PAIRING_TOKEN or add \"token\" to the daemon config file")
	}
	return cfg, nil
}

// configFilePath returns the first daemon config path that exists, or "" if none.
func configFilePath() string {
	if p := os.Getenv("IG_DAEMON_CONFIG"); p != "" {
		return p
	}
	if _, err := os.Stat("daemon.config.json"); err == nil {
		return "daemon.config.json"
	}
	if dir, err := os.UserConfigDir(); err == nil {
		p := filepath.Join(dir, "instagram-cli", "config.json")
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}
