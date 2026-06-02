package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"sync"
	"sync/atomic"
	"time"
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

// RPCClient manages bidirectional JSON-RPC communication with the backend.
type RPCClient struct {
	stdin  io.Writer
	mu     sync.Mutex // protects writes to stdin
	nextID atomic.Int64

	pendingMu sync.Mutex
	pending   map[int64]chan RPCResponse

	Events chan RPCEvent
}

// NewRPCClient creates an RPCClient and starts the background read loop.
func NewRPCClient(stdin io.Writer, stdout io.Reader) *RPCClient {
	c := &RPCClient{
		stdin:   stdin,
		pending: make(map[int64]chan RPCResponse),
		Events:  make(chan RPCEvent, 64),
	}
	go c.readLoop(stdout)
	return c
}

// readLoop reads newline-delimited JSON from stdout and dispatches responses
// to their pending channels and events to the Events channel.
func (c *RPCClient) readLoop(stdout io.Reader) {
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024) // 1MB buffer

	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		// Peek to determine if this is a response (has "id") or event (has "event").
		var peek struct {
			ID    *int64 `json:"id"`
			Event string `json:"event"`
		}
		if err := json.Unmarshal(line, &peek); err != nil {
			continue
		}

		if peek.Event != "" {
			// This is an event.
			var evt RPCEvent
			if err := json.Unmarshal(line, &evt); err != nil {
				continue
			}
			c.Events <- evt
		} else if peek.ID != nil {
			// This is a response to a request.
			var resp RPCResponse
			if err := json.Unmarshal(line, &resp); err != nil {
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

	// EOF — backend process has exited. Send sentinel event.
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
	data = append(data, '\n')

	// Register pending channel before writing to avoid race.
	ch := make(chan RPCResponse, 1)
	c.pendingMu.Lock()
	c.pending[id] = ch
	c.pendingMu.Unlock()

	// Write to stdin under mutex.
	c.mu.Lock()
	_, err = c.stdin.Write(data)
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
