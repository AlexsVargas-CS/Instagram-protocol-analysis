package main

import (
	"encoding/json"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/gorilla/websocket"
)

// RPCRequest is the JSON-RPC request sent to the backend.
type RPCRequest struct {
	ID     int64                  `json:"id"`
	Method string                 `json:"method"`
	Params map[string]interface{} `json:"params"`
}

// RPCResponse is a JSON-RPC response from the backend (has "id" field).
type RPCResponse struct {
	ID     int64            `json:"id"`
	Result json.RawMessage  `json:"result"`
	Error  *RPCError        `json:"error"`
}

// RPCError is the error payload inside a JSON-RPC response.
type RPCError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// RPCEvent is an unsolicited event from the backend (has "event" field, no "id").
type RPCEvent struct {
	Event string          `json:"event"`
	Data  json.RawMessage `json:"data"`
}

// RPCClient manages bidirectional JSON-RPC communication with the daemon over a
// WebSocket connection. Each WS frame carries exactly one JSON message, so there
// is no newline framing — the frame boundary IS the message boundary.
type RPCClient struct {
	conn   *websocket.Conn
	mu     sync.Mutex // serializes writes (gorilla forbids concurrent writers)
	nextID atomic.Int64

	pendingMu sync.Mutex
	pending   map[int64]chan RPCResponse

	Events chan RPCEvent

	closeOnce sync.Once
}

// NewRPCClient creates an RPCClient over an already-dialed WebSocket connection
// and starts the background read loop.
func NewRPCClient(conn *websocket.Conn) *RPCClient {
	c := &RPCClient{
		conn:    conn,
		pending: make(map[int64]chan RPCResponse),
		Events:  make(chan RPCEvent, 64),
	}
	go c.readLoop()
	return c
}

// Close tears down the underlying WebSocket connection. The read loop will then
// observe a read error and emit the "__disconnected" sentinel.
func (c *RPCClient) Close() error {
	var err error
	c.closeOnce.Do(func() {
		err = c.conn.Close()
	})
	return err
}

// readLoop reads one JSON message per WebSocket frame and dispatches responses to
// their pending channels and events to the Events channel.
func (c *RPCClient) readLoop() {
	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			break // connection closed or errored — fall through to sentinel
		}
		if len(data) == 0 {
			continue
		}

		// Peek to determine if this is a response (has "id") or event (has "event").
		var peek struct {
			ID    *int64 `json:"id"`
			Event string `json:"event"`
		}
		if err := json.Unmarshal(data, &peek); err != nil {
			continue
		}

		if peek.Event != "" {
			// This is an event.
			var evt RPCEvent
			if err := json.Unmarshal(data, &evt); err != nil {
				continue
			}
			c.Events <- evt
		} else if peek.ID != nil {
			// This is a response to a request.
			var resp RPCResponse
			if err := json.Unmarshal(data, &resp); err != nil {
				continue
			}
			c.pendingMu.Lock()
			ch, ok := c.pending[resp.ID]
			if ok {
				delete(c.pending, resp.ID)
			}
			c.pendingMu.Unlock()
			if ok {
				ch <- resp
			}
		}
	}

	// Connection closed — daemon unreachable. Send sentinel event.
	c.Events <- RPCEvent{Event: "__disconnected"}
}

// RPC timeouts. Auth methods chain several Instagram requests (preLoginSync,
// login, reels tray, timeline, session save) and need a larger budget than a
// single-request call.
const (
	defaultRPCTimeout = 30 * time.Second
	authRPCTimeout    = 120 * time.Second
)

// Send sends a JSON-RPC request with the default timeout.
func (c *RPCClient) Send(method string, params map[string]interface{}) (json.RawMessage, error) {
	return c.SendWithTimeout(method, params, defaultRPCTimeout)
}

// SendWithTimeout sends a JSON-RPC request and blocks until a response arrives
// or the timeout elapses.
func (c *RPCClient) SendWithTimeout(method string, params map[string]interface{}, timeout time.Duration) (json.RawMessage, error) {
	id := c.nextID.Add(1)

	req := RPCRequest{
		ID:     id,
		Method: method,
		Params: params,
	}
	if req.Params == nil {
		req.Params = map[string]interface{}{}
	}

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// Register pending channel before writing to avoid race.
	ch := make(chan RPCResponse, 1)
	c.pendingMu.Lock()
	c.pending[id] = ch
	c.pendingMu.Unlock()

	// Write one frame under mutex (gorilla forbids concurrent writers).
	c.mu.Lock()
	err = c.conn.WriteMessage(websocket.TextMessage, data)
	c.mu.Unlock()
	if err != nil {
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
		return nil, fmt.Errorf("write request: %w", err)
	}

	// Wait for response with timeout.
	select {
	case resp := <-ch:
		if resp.Error != nil {
			return nil, fmt.Errorf("rpc error %d: %s", resp.Error.Code, resp.Error.Message)
		}
		return resp.Result, nil
	case <-time.After(timeout):
		c.pendingMu.Lock()
		delete(c.pending, id)
		c.pendingMu.Unlock()
		return nil, fmt.Errorf("rpc timeout: %s (id=%d)", method, id)
	}
}
