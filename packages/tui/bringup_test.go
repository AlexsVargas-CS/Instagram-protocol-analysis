package main

import (
	"errors"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// Real-shaped data captured from the live M1 backend run (@alexv93740).
const (
	mePK     = "79992979604"
	themPK   = "12046891266"
	thread1  = "340282366841710301244259985841807392391"
	thread2  = "340282366841710301244260110775161571525"
)

func newTestModel() Model {
	m := InitialModel()
	m.conversationCache = make(map[string][]Message)
	m.cursorCache = make(map[string]string)
	m.hasOlderCache = make(map[string]bool)
	m.userPK = mePK
	m.username = "alexv93740"
	m.connected = true
	// Give it a terminal size.
	nm, _ := m.Update(tea.WindowSizeMsg{Width: 120, Height: 40})
	return nm.(Model)
}

func realThreads() []Thread {
	return []Thread{
		{
			ThreadID: thread1,
			Users:    []User{{PK: themPK, Username: "alexs_2552"}},
			LastMessage: Message{ItemId: "32843310930452136113023805707780096",
				Text: "Yuh it works", Timestamp: 1780439453120656, UserId: themPK},
			UnreadCount: 0, LastActivityAt: 1780439453120000,
		},
		{
			ThreadID: thread2,
			Users:    []User{{PK: "7439964814", Username: "natb4466"}},
			LastMessage: Message{Text: "hey there", Timestamp: 1780430000000000, UserId: "7439964814"},
			UnreadCount: 2, LastActivityAt: 1780430000000000,
		},
	}
}

func realMessages() []Message {
	return []Message{
		{ItemId: "a1", Text: "checking messages again", Timestamp: 1780430621592009, UserId: mePK},
		{ItemId: "a2", Text: "It works", Timestamp: 1780430628275993, UserId: themPK},
		{ItemId: "a3", Text: "testing if dupe messages show up", Timestamp: 1780430646314125, UserId: mePK},
		{ItemId: "a4", Text: "Yuh it works", Timestamp: 1780439453120656, UserId: themPK},
	}
}

func key(s string) tea.KeyMsg {
	switch s {
	case "enter":
		return tea.KeyMsg{Type: tea.KeyEnter}
	case "esc":
		return tea.KeyMsg{Type: tea.KeyEsc}
	default:
		return tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune(s)}
	}
}

// TestM2_ThreadsAndConversationRender drives the real Update/View pipeline with
// live-shaped data and verifies threads populate, navigation works, and message
// alignment / sender labels / timestamps render correctly.
func TestM2_ThreadsAndConversationRender(t *testing.T) {
	m := newTestModel()

	// Threads arrive from the backend.
	nm, _ := m.Update(ThreadsLoadedMsg{Threads: realThreads()})
	m = nm.(Model)

	frame := m.View()
	t.Log("\n=== BROWSE (thread list) ===\n" + frame)
	for _, want := range []string{"alexs_2552", "natb4466", "CHATS", "Connected as alexv93740"} {
		if !strings.Contains(frame, want) {
			t.Errorf("thread list missing %q", want)
		}
	}
	// natb4466 has 2 unread — the pink badge should show "2".
	if !strings.Contains(frame, "2") {
		t.Errorf("expected unread badge for natb4466")
	}

	// Pre-seed the conversation cache so opening the thread is a cache hit
	// (no live RPC needed in a unit test).
	m.conversationCache[thread1] = realMessages()
	m.hasOlderCache[thread1] = false

	// j moves down then k back to top (thread 0), then Enter opens it.
	nm, _ = m.Update(key("j"))
	m = nm.(Model)
	nm, _ = m.Update(key("k"))
	m = nm.(Model)
	nm, _ = m.Update(key("enter"))
	m = nm.(Model)

	if m.activeThread == nil || m.activeThread.ThreadID != thread1 {
		t.Fatalf("Enter did not open thread1; activeThread=%v", m.activeThread)
	}
	if m.stateName() != "READ" {
		t.Errorf("expected READ state after opening, got %s", m.stateName())
	}

	conv := m.View()
	t.Log("\n=== READ (conversation) ===\n" + conv)
	for _, want := range []string{
		"checking messages again", // my message
		"It works",                // their message
		"Yuh it works",
		"✓✓",          // read-receipt marker on my (right-aligned) bubbles
		"● alexs_2552", // green sender label on their bubble
	} {
		if !strings.Contains(conv, want) {
			t.Errorf("conversation missing %q", want)
		}
	}

	// Alignment sanity: a "my" message line should be indented further right
	// than a "their" message line of similar length.
	myIdx := strings.Index(conv, "checking messages again")
	theirIdx := strings.Index(conv, "It works")
	myCol := myIdx - strings.LastIndex(conv[:myIdx], "\n")
	theirCol := theirIdx - strings.LastIndex(conv[:theirIdx], "\n")
	if myCol <= theirCol {
		t.Errorf("expected my message right-aligned (col %d) past theirs (col %d)", myCol, theirCol)
	}
}

// TestM2_RealtimeMessageAppends verifies an incoming MQTT message lands in the
// open conversation and bumps the thread to the top with an unread badge when
// not being viewed.
func TestM2_RealtimeMessageAppends(t *testing.T) {
	m := newTestModel()
	nm, _ := m.Update(ThreadsLoadedMsg{Threads: realThreads()})
	m = nm.(Model)

	// New message arrives for thread2 (not currently open).
	incoming := Message{ItemId: "z1", Text: "live ping", Timestamp: 1780440000000000, UserId: "7439964814"}
	nm, _ = m.Update(NewMessageMsg{ThreadID: thread2, Message: incoming})
	m = nm.(Model)

	if m.threads[0].ThreadID != thread2 {
		t.Errorf("expected thread2 bubbled to top, got %s", m.threads[0].ThreadID)
	}
	if got := m.threads[0].UnreadCount; got != 3 { // was 2, +1
		t.Errorf("expected unread 3 after live msg, got %d", got)
	}
	if m.conversationCache[thread2][len(m.conversationCache[thread2])-1].Text != "live ping" {
		t.Errorf("live message not appended to cache")
	}
}

// TestM4_ExpiredSessionPromptsRelogin verifies that a session-expired error from
// any read/write RPC drops the UI back to the login screen (M4 / acceptance),
// pre-filling the known username, rather than silently showing a status string.
func TestM4_ExpiredSessionPromptsRelogin(t *testing.T) {
	// Both em-dash and colon message variants the backend emits.
	cases := []struct {
		name string
		msg  tea.Msg
	}{
		{"getThreads", ThreadsLoadedMsg{Err: errors.New("rpc error -32001: Session expired — please log in again")}},
		{"getMessages", MessagesLoadedMsg{ThreadID: thread1, Err: errors.New("rpc error -32001: Session expired: please log in again")}},
		{"sendMessage", MessageSentMsg{ThreadID: thread1, Err: errors.New("rpc error -32001: Session expired — please log in again")}},
		{"markRead", MarkReadMsg{ThreadID: thread1, Err: errors.New("rpc error -32001: Session expired — please log in again")}},
	}
	for _, tc := range cases {
		m := newTestModel()
		nm, _ := m.Update(tc.msg)
		m = nm.(Model)
		if m.mode != ModeLogin {
			t.Errorf("%s: expected ModeLogin after expiry, got %s", tc.name, m.mode.String())
		}
		if m.loginStep != LoginStepUsername {
			t.Errorf("%s: expected LoginStepUsername, got %v", tc.name, m.loginStep)
		}
		if m.connected {
			t.Errorf("%s: expected connected=false after expiry", tc.name)
		}
		if m.usernameInput.Value() != "alexv93740" {
			t.Errorf("%s: expected username pre-filled, got %q", tc.name, m.usernameInput.Value())
		}
		if !strings.Contains(m.View(), "Session expired") {
			t.Errorf("%s: login screen should show the expiry reason", tc.name)
		}
	}

	// A NON-expiry error must NOT trigger re-login.
	m := newTestModel()
	nm, _ := m.Update(ThreadsLoadedMsg{Err: errors.New("rpc error -32000: Failed to fetch threads")})
	m = nm.(Model)
	if m.mode == ModeLogin {
		t.Errorf("a generic API error should not force re-login")
	}
	if !strings.Contains(m.statusMsg, "Failed to load threads") {
		t.Errorf("generic error should show status, got %q", m.statusMsg)
	}
}
