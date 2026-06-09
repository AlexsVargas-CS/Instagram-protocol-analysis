package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gorilla/websocket"
)

// TestWSClientRoundTrip stands up an in-process WebSocket "daemon" (httptest +
// gorilla upgrader) and drives the real RPCClient against it: it verifies the
// pairing token reaches the server as a Bearer header, an event is delivered to
// the Events channel, a request/response round-trips, an error response surfaces,
// and a server close produces the __disconnected sentinel. No network, no PTY,
// no Instagram — pure transport-substrate verification for the M3 migration.
func TestWSClientRoundTrip(t *testing.T) {
	upgrader := websocket.Upgrader{CheckOrigin: func(*http.Request) bool { return true }}
	authCh := make(chan string, 1)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authCh <- r.Header.Get("Authorization")
		c, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		defer c.Close()

		// Emit an event on connect, like the daemon's sessionRestored.
		_ = c.WriteMessage(websocket.TextMessage,
			[]byte(`{"event":"sessionRestored","data":{"success":true,"user":{"pk":"1","username":"x"}}}`))

		for {
			_, data, err := c.ReadMessage()
			if err != nil {
				return
			}
			var req struct {
				ID     int64  `json:"id"`
				Method string `json:"method"`
			}
			_ = json.Unmarshal(data, &req)
			switch req.Method {
			case "getThreads":
				_ = c.WriteMessage(websocket.TextMessage, fmt.Appendf(nil,
					`{"id":%d,"result":{"threads":[{"thread_id":"t1"}],"oldestCursor":null,"hasOlder":false}}`, req.ID))
			default:
				_ = c.WriteMessage(websocket.TextMessage, fmt.Appendf(nil,
					`{"id":%d,"error":{"code":-32601,"message":"Method not found: %s"}}`, req.ID, req.Method))
			}
		}
	}))
	defer srv.Close()

	rpc, err := DialDaemon(DaemonConfig{Address: srv.URL, Token: "tok-123"})
	if err != nil {
		t.Fatalf("DialDaemon: %v", err)
	}
	defer rpc.Close()

	// 1. The pairing token reached the server as a Bearer header.
	select {
	case got := <-authCh:
		if got != "Bearer tok-123" {
			t.Errorf("Authorization header = %q, want %q", got, "Bearer tok-123")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("server never saw the connection")
	}

	// 2. The connect event was delivered to the Events channel.
	select {
	case evt := <-rpc.Events:
		if evt.Event != "sessionRestored" {
			t.Errorf("first event = %q, want sessionRestored", evt.Event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no sessionRestored event")
	}

	// 3. Request/response round-trips through the pending map.
	res, err := rpc.Send("getThreads", nil)
	if err != nil {
		t.Fatalf("getThreads: %v", err)
	}
	var parsed GetThreadsResult
	if err := json.Unmarshal(res, &parsed); err != nil {
		t.Fatalf("unmarshal getThreads result: %v", err)
	}
	if len(parsed.Threads) != 1 || parsed.Threads[0].ThreadID != "t1" {
		t.Errorf("getThreads result = %+v, want one thread t1", parsed.Threads)
	}

	// 4. Error responses surface as Go errors with the daemon's message.
	if _, err := rpc.Send("nope", nil); err == nil || !strings.Contains(err.Error(), "Method not found") {
		t.Errorf("expected method-not-found error, got %v", err)
	}

	// 5. A closed connection yields the __disconnected sentinel. (Closing the
	// client side deterministically triggers the readLoop's read error; httptest
	// does not force-close hijacked WebSocket conns, so a server-side Close() is
	// unreliable here. Either side closing drives the same sentinel path.)
	if err := rpc.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}
	select {
	case evt := <-rpc.Events:
		if evt.Event != "__disconnected" {
			t.Errorf("after close, event = %q, want __disconnected", evt.Event)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("no __disconnected sentinel after close")
	}
}
