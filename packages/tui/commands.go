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
	ThreadID     string
	Messages     []Message
	OldestCursor *string
	HasOlder     bool
	IsOlderPage  bool
	Err          error
}

// LoginResultMsg carries the result of a "login" RPC call.
type LoginResultMsg struct {
	User User
	Err  error
}

// MessageSentMsg carries the result of a "sendMessage" RPC call.
type MessageSentMsg struct {
	ThreadID string
	Message  *Message
	Err      error
}

// NewMessageMsg carries a real-time incoming message from MQTT.
type NewMessageMsg struct {
	ThreadID string  `json:"threadId"`
	Message  Message `json:"message"`
}

// MarkReadMsg carries the result of a "markRead" RPC call.
type MarkReadMsg struct {
	ThreadID string
	Err      error
}

// ChallengeResultMsg carries the result of a "submitChallenge" RPC call.
type ChallengeResultMsg struct {
	User User
	Err  error
}

// TwoFactorResultMsg carries the result of a "submitTwoFactor" RPC call.
type TwoFactorResultMsg struct {
	User User
	Err  error
}

// ---------------------------------------------------------------------------
// Command factories — return tea.Cmd that perform async work via the RPC client.
// ---------------------------------------------------------------------------

// listenForBackendEvents blocks on the RPC event channel and returns the
// appropriate Msg. Must be re-issued from Update() after each event to
// keep the subscription alive.
func listenForBackendEvents(rpc *RPCClient) tea.Cmd {
	return func() tea.Msg {
		for {
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
			case "newMessage":
				var data NewMessageMsg
				if err := json.Unmarshal(evt.Data, &data); err != nil {
					continue // skip malformed events
				}
				return data
			default:
				// Unknown event — loop back and keep listening.
				continue
			}
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
func fetchMessagesCmd(rpc *RPCClient, threadID string, cursor string, isOlderPage bool) tea.Cmd {
	return func() tea.Msg {
		params := map[string]interface{}{
			"thread_id": threadID,
		}
		if cursor != "" {
			params["cursor"] = cursor
		}
		result, err := rpc.Send("getMessages", params)
		if err != nil {
			return MessagesLoadedMsg{ThreadID: threadID, Err: err}
		}
		var parsed GetMessagesResult
		if err := json.Unmarshal(result, &parsed); err != nil {
			return MessagesLoadedMsg{ThreadID: threadID, Err: err}
		}
		return MessagesLoadedMsg{
			ThreadID:     threadID,
			Messages:     parsed.Messages,
			OldestCursor: parsed.OldestCursor,
			HasOlder:     parsed.HasOlder,
			IsOlderPage:  isOlderPage,
		}
	}
}

// sendMessageCmd calls "sendMessage" on the backend.
func sendMessageCmd(rpc *RPCClient, threadID, text string) tea.Cmd {
	return func() tea.Msg {
		result, err := rpc.Send("sendMessage", map[string]interface{}{
			"thread_id": threadID,
			"text":      text,
		})
		if err != nil {
			return MessageSentMsg{ThreadID: threadID, Err: err}
		}
		var msg Message
		if err := json.Unmarshal(result, &msg); err != nil {
			return MessageSentMsg{ThreadID: threadID, Err: err}
		}
		return MessageSentMsg{ThreadID: threadID, Message: &msg}
	}
}

// loginCmd calls "login" on the backend with username and password.
func loginCmd(rpc *RPCClient, username, password string) tea.Cmd {
	return func() tea.Msg {
		result, err := rpc.Send("login", map[string]interface{}{
			"username": username,
			"password": password,
		})
		if err != nil {
			return LoginResultMsg{Err: err}
		}
		var user User
		if err := json.Unmarshal(result, &user); err != nil {
			return LoginResultMsg{Err: err}
		}
		return LoginResultMsg{User: user}
	}
}

// markReadCmd calls "markRead" on the backend.
func markReadCmd(rpc *RPCClient, threadID, itemID string) tea.Cmd {
	return func() tea.Msg {
		_, err := rpc.Send("markRead", map[string]interface{}{
			"thread_id": threadID,
			"item_id":   itemID,
		})
		return MarkReadMsg{ThreadID: threadID, Err: err}
	}
}

// submitChallengeCmd calls "submitChallenge" on the backend with the verification code.
func submitChallengeCmd(rpc *RPCClient, code string) tea.Cmd {
	return func() tea.Msg {
		result, err := rpc.Send("submitChallenge", map[string]interface{}{
			"code": code,
		})
		if err != nil {
			return ChallengeResultMsg{Err: err}
		}
		var user User
		if err := json.Unmarshal(result, &user); err != nil {
			return ChallengeResultMsg{Err: err}
		}
		return ChallengeResultMsg{User: user}
	}
}

// submitTwoFactorCmd calls "submitTwoFactor" on the backend with the 2FA code.
func submitTwoFactorCmd(rpc *RPCClient, code string) tea.Cmd {
	return func() tea.Msg {
		result, err := rpc.Send("submitTwoFactor", map[string]interface{}{
			"code": code,
		})
		if err != nil {
			return TwoFactorResultMsg{Err: err}
		}
		var user User
		if err := json.Unmarshal(result, &user); err != nil {
			return TwoFactorResultMsg{Err: err}
		}
		return TwoFactorResultMsg{User: user}
	}
}
