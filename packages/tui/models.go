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
	default:
		return "UNKNOWN"
	}

}

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
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
	UserId string `json:"userId"`
}
//nil means not fetched yet

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
	searchInput     textinput.Model
	filteredIndices []int

	// Right panel — conversation
	activeThread      *Thread
	activeMessages    []Message
	messageViewport   viewport.Model
	conversationCache map[string][]Message
	messageInput      textinput.Model
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

	return Model{
		mode:            ModeNormal,
		searchInput:     searchInput,
		messageInput:    msgInput,
		messageViewport: vp,
	}
}

func (m Model) Init() tea.Cmd {
	if m.rpc != nil {
		return listenForBackendEvents(m.rpc)
	}
	return nil
}
