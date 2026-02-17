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
	width     int
	height    int
	connected bool
	username  string
	statusMsg string
	err       error

	// IPC — backend process and RPC client
	backend *Backend
	rpc     *RPCClient

	threads []Thread
	cursor  int // index of highlighted thread

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


func InitialModel() Model{
	//config for search bar 
	searchInput  := textinput.New()
	searchInput.Placeholder = "Search threads..."
	searchInput.CharLimit = 64

	msgInput := textinput.New()
	msgInput.Placeholder = "Type a message..."
	msgInput.CharLimit = 2000

	return Model{
		mode: ModeNormal,
		searchInput: searchInput,
		messageInput: msgInput,

	}

}

func (m Model) Init() tea.Cmd {
	if m.rpc != nil {
		return listenForBackendEvents(m.rpc)
	}
	return nil
}
