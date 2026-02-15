package main

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
)

// ---------------------------------------------------------------------------
// Update — handles all incoming messages (events) from bubbletea.
//
// This is the core event loop. bubbletea calls this every time something
// happens: a key press, terminal resize, or a command completing.
//
// The msg parameter is a tea.Msg interface — we use a type switch to
// determine what kind of message it is and handle it accordingly.
// Think of it like a big event dispatcher.
//
// Returns the updated model and an optional command for bubbletea to
// execute asynchronously (like fetching data). nil command = do nothing.
// ---------------------------------------------------------------------------

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {

	// Terminal was resized (or this is the initial size on startup).
	// Store dimensions so View() can calculate panel layout.
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

// ---------------------------------------------------------------------------
// updateNormalMode — handles keys in the default navigation mode.
//
// j/k: move cursor up/down in thread list
// Enter: load the selected conversation
// s: switch to search mode
// i: switch to insert mode
// q/ctrl+c: quit
//
// If loaded is true (user has loaded at least one conversation),
// j/k also triggers loading the newly selected conversation.
// ---------------------------------------------------------------------------

func (m Model) updateNormalMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "q", "ctrl+c":
		return m, tea.Quit

	case "j", "down":
		// Move cursor down, clamped to list length
		visible := m.getVisibleThreads()
		if m.cursor < len(visible)-1 {
			m.cursor++
		}
		// If already loaded, immediately show the new conversation
		if m.loaded {
			m.loadConversation()
		}
		return m, nil

	case "k", "up":
		// Move cursor up, clamped to 0
		if m.cursor > 0 {
			m.cursor--
		}
		if m.loaded {
			m.loadConversation()
		}
		return m, nil

	case "enter":
		// Load the selected conversation and flip the loaded latch
		m.loaded = true
		m.loadConversation()
		return m, nil

	case "s":
		// Switch to search mode and focus the search input
		m.mode = ModeSearch
		m.searchInput.Focus()
		// Reset cursor to top of filtered list
		m.cursor = 0
		return m, nil

	case "i":
		// Switch to insert mode and focus the message input.
		// Only allow if a conversation is loaded — can't type
		// into nothing.
		if m.activeThread != nil {
			m.mode = ModeInsert
			m.messageInput.Focus()
		}
		return m, nil
	}

	return m, nil
}

// ---------------------------------------------------------------------------
// updateSearchMode — handles keys when the search bar is active.
//
// Esc: cancel search, return to normal mode, clear filter
// Enter: select the highlighted thread from filtered results
// All other keys: forwarded to searchInput sub-model, then rebuild filter
//
// After forwarding to searchInput, we check if the query changed and
// rebuild filteredIndices. The cursor is clamped to the new list length
// in case the filtered results shrank.
// ---------------------------------------------------------------------------

func (m Model) updateSearchMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "esc":
		// Cancel search: return to normal, clear filter and input
		m.mode = ModeNormal
		m.searchInput.Blur()
		m.searchInput.SetValue("")
		m.filteredIndices = nil
		m.cursor = 0
		return m, nil

	case "enter":
		// Select the currently highlighted thread from filtered results
		visible := m.getVisibleThreads()
		if len(visible) > 0 && m.cursor < len(visible) {
			// Map the filtered cursor back to the real thread index
			realIndex := visible[m.cursor]
			// Exit search mode
			m.mode = ModeNormal
			m.searchInput.Blur()
			m.searchInput.SetValue("")
			m.filteredIndices = nil
			// Set cursor to the real index and load the conversation
			m.cursor = realIndex
			m.loaded = true
			m.loadConversation()
		}
		return m, nil
	}

	// Forward all other keys to the search input sub-model
	var cmd tea.Cmd
	m.searchInput, cmd = m.searchInput.Update(msg)

	// Rebuild filtered indices based on the new search query
	m.filterThreads()

	// Clamp cursor to filtered list bounds
	visible := m.getVisibleThreads()
	if m.cursor >= len(visible) {
		m.cursor = max(0, len(visible)-1)
	}

	return m, cmd
}

// ---------------------------------------------------------------------------
// updateInsertMode — handles keys when composing a message.
//
// Esc: cancel, clear input, return to normal
// Enter: "send" the message (Phase 2: just clear input and return)
// All other keys: forwarded to messageInput sub-model
// ---------------------------------------------------------------------------

func (m Model) updateInsertMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "esc":
		// Cancel: clear input and return to normal mode
		m.mode = ModeNormal
		m.messageInput.Blur()
		m.messageInput.SetValue("")
		return m, nil

	case "enter":
		// "Send" the message
		text := strings.TrimSpace(m.messageInput.Value())
		if text != "" {
			// Phase 2: no backend, so we just add the message locally
			// as a preview. In Phase 3, this sends a JSON-RPC request
			// to the backend and the response adds the real message.
			newMsg := Message{
				Text:   text,
				UserId: "me",
			}
			m.activeMessages = append(m.activeMessages, newMsg)
			m.statusMsg = "Message sent"
		}
		// Clear input and return to normal mode
		m.mode = ModeNormal
		m.messageInput.Blur()
		m.messageInput.SetValue("")
		return m, nil
	}

	// Forward all other keys to the message input sub-model
	var cmd tea.Cmd
	m.messageInput, cmd = m.messageInput.Update(msg)
	return m, cmd
}

// ---------------------------------------------------------------------------
// loadConversation sets the active conversation based on the current cursor.
//
// In Phase 2, this just sets activeThread and clears activeMessages.
// In Phase 3, this will send a getMessages JSON-RPC request to the backend
// and return a tea.Cmd that fires when the response arrives.
// ---------------------------------------------------------------------------

func (m *Model) loadConversation() {
	if len(m.threads) == 0 {
		return
	}

	// Bounds check
	if m.cursor >= len(m.threads) {
		m.cursor = len(m.threads) - 1
	}

	// Set the active thread (pointer to the thread in our slice)
	m.activeThread = &m.threads[m.cursor]

	// Clear messages — in Phase 3, a getMessages command will populate these.
	// For Phase 2, we leave them empty. The View handles the empty state.
	m.activeMessages = nil
}

// ---------------------------------------------------------------------------
// filterThreads rebuilds filteredIndices based on the current search query.
//
// Checks each thread's usernames for a case-insensitive match against the
// search input value. Stores matching indices into filteredIndices.
// If the query is empty, clears filteredIndices (shows all threads).
// ---------------------------------------------------------------------------

func (m *Model) filterThreads() {
	query := strings.ToLower(strings.TrimSpace(m.searchInput.Value()))

	// Empty query — show all threads
	if query == "" {
		m.filteredIndices = nil
		return
	}

	m.filteredIndices = []int{} // empty, not nil — means "searched, no results yet"
	for i, thread := range m.threads {
		for _, user := range thread.Users {
			if strings.Contains(strings.ToLower(user.Username), query) {
				m.filteredIndices = append(m.filteredIndices, i)
				break
			}
		}
	}
}





