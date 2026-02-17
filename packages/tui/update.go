package main

import (
	"strings"
	"time"

	tea "github.com/charmbracelet/bubbletea"
)

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {

	case tea.WindowSizeMsg:
		m.width = msg.Width
		m.height = msg.Height
		return m, nil

	// A key was pressed — behavior depends on current mode.
	case tea.KeyMsg:
		switch m.mode {
		case ModeNormal:
			return m.updateNormalMode(msg)
		case ModeSearch:
			return m.updateSearchMode(msg)
		case ModeInsert:
			return m.updateInsertMode(msg)
		}
	}

	return m, nil
}


func (m Model) updateNormalMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "q", "ctrl+c":
		return m, tea.Quit

	case "j", "down":
		visible := m.getVisibleThreads()
		if m.cursor < len(visible)-1 {
			m.cursor++
		}
		if m.loaded {
			m.loadConversation()
		}
		return m, nil

	case "k", "up":
		if m.cursor > 0 {
			m.cursor--
		}
		if m.loaded {
			m.loadConversation()
		}
		return m, nil

	case "enter":
		m.loaded = true
		m.loadConversation()
		return m, nil

	case "s":
		m.mode = ModeSearch
		m.searchInput.Focus()
		m.cursor = 0
		return m, nil

	case "i":
		
		if m.activeThread != nil {
			m.mode = ModeInsert
			m.messageInput.Focus()
		}
		return m, nil
	}

	return m, nil
}

func (m Model) updateSearchMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "esc":
		m.mode = ModeNormal
		m.searchInput.Blur()
		m.searchInput.SetValue("")
		m.filteredIndices = nil
		m.cursor = 0
		return m, nil

	case "enter":
		visible := m.getVisibleThreads()
		if len(visible) > 0 && m.cursor < len(visible) {
			// Map filtered cursor back to the real thread index
			realIndex := visible[m.cursor]

			m.mode = ModeNormal
			m.searchInput.Blur()
			m.searchInput.SetValue("")
			m.filteredIndices = nil
			// Set cursor to real index and load the convo
			m.cursor = realIndex
			m.loaded = true
			m.loadConversation()
		}
		return m, nil
	}

	var cmd tea.Cmd
	m.searchInput, cmd = m.searchInput.Update(msg)

	m.filterThreads()

	// Clamp cursor to filtered list bounds
	visible := m.getVisibleThreads()
	if m.cursor >= len(visible) {
		m.cursor = max(0, len(visible)-1)
	}

	return m, cmd
}

func (m Model) updateInsertMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "esc":
		m.mode = ModeNormal
		m.messageInput.Blur()
		m.messageInput.SetValue("")
		return m, nil
	case "enter":
		text := strings.TrimSpace(m.messageInput.Value())
		if text != "" {
			newMsg := Message{
				Text:      text,
				Timestamp: time.Now().UnixMicro(),
				UserId:    "me",
			}
			m.activeMessages = append(m.activeMessages, newMsg)
			m.statusMsg = "Message sent"
		}
		m.messageInput.SetValue("")
		return m, nil
	}
	var cmd tea.Cmd
	m.messageInput, cmd = m.messageInput.Update(msg)
	return m, cmd
}

func (m *Model) loadConversation() {
	if len(m.threads) == 0 {
		return
	}
	if m.cursor >= len(m.threads) {
		m.cursor = len(m.threads) - 1
	}
	m.activeThread = &m.threads[m.cursor]

	if msgs, ok := m.conversationCache[m.activeThread.ThreadID]; ok {
		m.activeMessages = msgs
	} else {
		m.activeMessages = nil
	}
}

func (m *Model) filterThreads() {
	query := strings.ToLower(strings.TrimSpace(m.searchInput.Value()))

	if query == "" {
		m.filteredIndices = nil
		return
	}

	m.filteredIndices = []int{} // empty but not nil means "searched, no results yet"
	for i, thread := range m.threads {
		for _, user := range thread.Users {
			if strings.Contains(strings.ToLower(user.Username), query) {
				m.filteredIndices = append(m.filteredIndices, i)
				break
			}
		}
	}
}





