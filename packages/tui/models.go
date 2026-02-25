package main

import (
	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
)

type Mode int

const (
	ModeNormal Mode = iota
	ModeSearch
	ModeInsert
	ModeLogin
)

type FocusPanel int

const (
	FocusThreadList FocusPanel = iota
	FocusConversation
)

func (m Mode) String() string {
	switch m {
	case ModeNormal:
		return "NORMAL"
	case ModeInsert:
		return "INSERT"
	case ModeSearch:
		return "SEARCH"
	case ModeLogin:
		return "LOGIN"
	default:
		return "UNKNOWN"
	}

}

type LoginStep int

const (
	LoginStepUsername LoginStep = iota
	LoginStepPassword
	LoginStepChallenge
	LoginStepChallengeUrl
	LoginStepTwoFactor
)

type User struct {
	PK       string `json:"pk"`
	Username string `json:"username"`
}

type Thread struct {
	ThreadID       string  `json:"thread_id"`
	Users          []User  `json:"users"`
	LastMessage    Message `json:"lastMessage"`
	UnreadCount    int     `json:"unreadCount"`
	LastActivityAt int64   `json:"lastActivityAt"`
	IsGroup        bool    `json:"is_group"`
}

type Message struct {
	ItemId    string `json:"itemId,omitempty"`
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
	UserId    string `json:"userId"`
}

type GetMessagesResult struct {
	Messages     []Message `json:"messages"`
	OldestCursor *string   `json:"oldestCursor"`
	HasOlder     bool      `json:"hasOlder"`
}

type GetThreadsResult struct {
	Threads      []Thread `json:"threads"`
	OldestCursor *string  `json:"oldestCursor"`
	HasOlder     bool     `json:"hasOlder"`
}

type Model struct {
	mode      Mode
	focus     FocusPanel
	pendingG  bool // for gg (go-to-top) two-key sequence
	width     int
	height    int
	connected bool
	username  string
	statusMsg string
	err       error

	// IPC — backend process and RPC client
	backend *Backend
	rpc     *RPCClient

	threads          []Thread
	cursor           int // index of highlighted thread
	threadListOffset int // scroll offset for left panel

	loaded bool // whether a convo has been loaded at least once

	// Search panel
	searchInput      textinput.Model
	filteredIndices  []int
	preSearchCursor  int

	// Right panel — conversation
	activeThread      *Thread
	activeMessages    []Message
	messageViewport   viewport.Model
	conversationCache map[string][]Message
	messageInput      textinput.Model

	// Pagination
	cursorCache   map[string]string // thread_id → oldest cursor
	hasOlderCache map[string]bool   // thread_id → has older messages
	loadingOlder  bool              // request in flight

	// Login
	loginStep      LoginStep
	usernameInput  textinput.Model
	passwordInput  textinput.Model
	challengeInput textinput.Model
	challengeHint  string // masked contact point, e.g. "a***@g***.com"
	challengeUrl   string // browser fallback URL for manual verification
	twoFactorHint  string // e.g. "Enter code from your authenticator app"
	loginError     string
}

const conversationHeaderHeight = 2 // @name + separator
const conversationInputHeight = 2  // blank line + input prompt

func (m Model) viewportHeight() int {
	bodyHeight := m.height - 2 // header bar + status bar
	return max(1, bodyHeight-conversationHeaderHeight-conversationInputHeight)
}

func (m Model) viewportWidth() int {
	return m.width - m.width/3 - 1
}


func InitialModel() Model {
	//config for search bar
	searchInput := textinput.New()
	searchInput.Placeholder = "Search threads..."
	searchInput.CharLimit = 64

	msgInput := textinput.New()
	msgInput.Placeholder = "Type a message..."
	msgInput.CharLimit = 2000

	vp := viewport.New(0, 0) // real dims arrive in WindowSizeMsg
	// Disable h/l horizontal scroll — we use those for panel switching
	vp.KeyMap.Left.SetEnabled(false)
	vp.KeyMap.Right.SetEnabled(false)

	usernameInput := textinput.New()
	usernameInput.Placeholder = "Username"
	usernameInput.CharLimit = 64

	passwordInput := textinput.New()
	passwordInput.Placeholder = "Password"
	passwordInput.CharLimit = 128
	passwordInput.EchoMode = textinput.EchoPassword
	passwordInput.EchoCharacter = '*'

	challengeInput := textinput.New()
	challengeInput.Placeholder = "6-digit code"
	challengeInput.CharLimit = 10

	return Model{
		mode:            ModeNormal,
		searchInput:     searchInput,
		messageInput:    msgInput,
		messageViewport: vp,
		usernameInput:   usernameInput,
		passwordInput:   passwordInput,
		challengeInput:  challengeInput,
	}
}

func (m Model) Init() tea.Cmd {
	if m.rpc != nil {
		return listenForBackendEvents(m.rpc)
	}
	return nil
}
