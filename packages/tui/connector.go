package main

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

// DialDaemon connects to the daemon over WebSocket using the configured address
// and pairing token. The token is sent as an Authorization: Bearer header, which
// the daemon validates at the handshake before any RPC is honored.
func DialDaemon(cfg DaemonConfig) (*RPCClient, error) {
	wsURL, err := normalizeWSURL(cfg.Address)
	if err != nil {
		return nil, err
	}

	header := http.Header{}
	if cfg.Token != "" {
		header.Set("Authorization", "Bearer "+cfg.Token)
	}

	dialer := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
	conn, resp, err := dialer.Dial(wsURL, header)
	if err != nil {
		if resp != nil && resp.StatusCode == http.StatusUnauthorized {
			return nil, fmt.Errorf("daemon rejected the pairing token (HTTP 401) at %s — check IG_PAIRING_TOKEN", wsURL)
		}
		return nil, fmt.Errorf("dial daemon at %s: %w", wsURL, err)
	}
	return NewRPCClient(conn), nil
}

// normalizeWSURL turns a config address into a ws:// or wss:// URL. A bare
// host:port becomes ws://host:port/; http/https are mapped to ws/wss.
func normalizeWSURL(addr string) (string, error) {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return "", fmt.Errorf("daemon address is empty")
	}
	if !strings.Contains(addr, "://") {
		addr = "ws://" + addr
	}
	u, err := url.Parse(addr)
	if err != nil {
		return "", fmt.Errorf("invalid daemon address %q: %w", addr, err)
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
		// already fine
	default:
		return "", fmt.Errorf("unsupported daemon scheme %q (use ws:// or wss://)", u.Scheme)
	}
	if u.Path == "" {
		u.Path = "/"
	}
	return u.String(), nil
}
