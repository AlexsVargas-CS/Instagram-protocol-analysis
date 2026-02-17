package main

import (
	"encoding/json"

	tea "github.com/charmbracelet/bubbletea"
)

// ---------------------------------------------------------------------------
// Message types — each represents an async result delivered to Update().
// ---------------------------------------------------------------------------

// SessionRestoredMsg is sent when the backend emits "sessionRestored".
type SessionRestoredMsg struct {
	Success bool `json:"success"`
}

// BackendDisconnectedMsg is sent when the backend process exits.
type BackendDisconnectedMsg struct{}

// ThreadsLoadedMsg carries the result of a "getThreads" RPC call.
type ThreadsLoadedMsg struct {
	Threads []Thread
	Err     error
}

// MessagesLoadedMsg carries the result of a "getMessages" RPC call.
type MessagesLoadedMsg struct {
	ThreadID string
	Messages []Message
	Err      error
}

// MessageSentMsg carries the result of a "sendMessage" RPC call.
type MessageSentMsg struct {
	ThreadID string
	Err      error
}

// ---------------------------------------------------------------------------
// Command factories — return tea.Cmd that perform async work via the RPC client.
// ---------------------------------------------------------------------------

// listenForBackendEvents blocks on the RPC event channel and returns the
// appropriate Msg. Must be re-issued from Update() after each event to
// keep the subscription alive.
func listenForBackendEvents(rpc *RPCClient) tea.Cmd {
	return func() tea.Msg {
		evt := <-rpc.Events

		switch evt.Event {
		case "sessionRestored":
			var data SessionRestoredMsg
			if err := json.Unmarshal(evt.Data, &data); err != nil {
				return SessionRestoredMsg{Success: false}
			}
			return data
		case "__disconnected":
			return BackendDisconnectedMsg{}
		default:
			// Unknown event — keep listening (will be re-issued from Update).
			return nil
		}
	}
}

// fetchThreadsCmd calls "getThreads" on the backend.
func fetchThreadsCmd(rpc *RPCClient) tea.Cmd {
	return func() tea.Msg {
		result, err := rpc.Send("getThreads", nil)
		if err != nil {
			return ThreadsLoadedMsg{Err: err}
		}
		var threads []Thread
		if err := json.Unmarshal(result, &threads); err != nil {
			return ThreadsLoadedMsg{Err: err}
		}
		return ThreadsLoadedMsg{Threads: threads}
	}
}

// fetchMessagesCmd calls "getMessages" on the backend for a specific thread.
func fetchMessagesCmd(rpc *RPCClient, threadID string) tea.Cmd {
	return func() tea.Msg {
		result, err := rpc.Send("getMessages", map[string]interface{}{
			"thread_id": threadID,
		})
		if err != nil {
			return MessagesLoadedMsg{ThreadID: threadID, Err: err}
		}
		var messages []Message
		if err := json.Unmarshal(result, &messages); err != nil {
			return MessagesLoadedMsg{ThreadID: threadID, Err: err}
		}
		return MessagesLoadedMsg{ThreadID: threadID, Messages: messages}
	}
}

// sendMessageCmd calls "sendMessage" on the backend.
func sendMessageCmd(rpc *RPCClient, threadID, text string) tea.Cmd {
	return func() tea.Msg {
		_, err := rpc.Send("sendMessage", map[string]interface{}{
			"thread_id": threadID,
			"text":      text,
		})
		return MessageSentMsg{ThreadID: threadID, Err: err}
	}
}
