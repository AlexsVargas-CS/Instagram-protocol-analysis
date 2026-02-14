package main

type Mode int

const (
	ModeNormal Mode = iota
	ModeSearch
	ModeInsert
)

//return humna readble for each mode GO calls this when we print a mode

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
	ThreadID     string `json:"thread_id"`
	Users        []User `json:"users"`
	LastMessage  string `json:"lastMessage"`
	Timestamp    int64  `json:"timestamp"`
	UnreadCount  int    `json:"unreadCount"`
	IsGroup      bool   `json:"is_group"`
	LastActivity int64  `json:"lastActivityAt"`
}

type Message struct {
	Text      string `json:"text"`
	Timestamp int64  `json:"timestamp"`
}
