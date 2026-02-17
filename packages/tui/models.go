package main

import (
	//"encoding/json"

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

type Model struct{
	mode Mode  //our current input mode 
	width int 
	height int
	connected bool
	username string
	statusMsg string
	err error


	threads []Thread
	cursor int // our index of our highlighted thread

	loaded bool	 //whether a convo has been loaded at least once
	// ------Search panel----

	searchInput textinput.Model 

	filteredIndices []int

	//----right panel---
	activeThread *Thread // start Thread pointer at nil
	activeMessages []Message //populated by getMessages() repsonse from backend
	
	messageViewport viewport.Model //manages scroll pos

	conversationCache map[string][]Message

	//----Right panel: convo-----
	messageInput textinput.Model

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
	return nil
}
