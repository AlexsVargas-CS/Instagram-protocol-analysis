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
		m.messageViewport.Width = m.viewportWidth()
		m.messageViewport.Height = m.viewportHeight()
		if m.activeMessages != nil {
			content := m.buildMessageContent()
			m.messageViewport.SetContent(content)
		}
		return m, nil

	// --- Async messages from backend ---

	case SessionRestoredMsg:
		m.connected = msg.Success
		if msg.Success {
			m.statusMsg = "Session restored"
		} else {
			m.statusMsg = "No session found"
		}
		var cmds []tea.Cmd
		if m.rpc != nil {
			cmds = append(cmds, listenForBackendEvents(m.rpc))
		}
		if msg.Success && m.rpc != nil {
			cmds = append(cmds, fetchThreadsCmd(m.rpc))
		}
		return m, tea.Batch(cmds...)

	case BackendDisconnectedMsg:
		m.connected = false
		m.statusMsg = "Backend disconnected"
		return m, nil

	case ThreadsLoadedMsg:
		if msg.Err != nil {
			m.statusMsg = "Failed to load threads: " + msg.Err.Error()
			return m, nil
		}
		m.threads = msg.Threads
		m.statusMsg = "Threads loaded"
		return m, nil

	case MessagesLoadedMsg:
		if msg.Err != nil {
			m.statusMsg = "Failed to load messages: " + msg.Err.Error()
			return m, nil
		}
		// Cache the messages.
		m.conversationCache[msg.ThreadID] = msg.Messages
		// If the user is still viewing this thread, update the display.
		if m.activeThread != nil && m.activeThread.ThreadID == msg.ThreadID {
			m.activeMessages = msg.Messages
			content := m.buildMessageContent()
			m.messageViewport.SetContent(content)
			m.messageViewport.GotoBottom()
		}
		m.statusMsg = ""
		return m, nil

	case MessageSentMsg:
		if msg.Err != nil {
			m.statusMsg = "Send failed: " + msg.Err.Error()
		}
		return m, nil

	// --- Keyboard input ---

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
	switch m.focus {
	case FocusThreadList:
		return m.updateNormalThreadList(msg)
	case FocusConversation:
		return m.updateNormalConversation(msg)
	}
	return m, nil
}

func (m Model) updateNormalThreadList(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "q", "ctrl+c":
		return m, tea.Quit

	case "j", "down":
		visible := m.getVisibleThreads()
		if m.cursor < len(visible)-1 {
			m.cursor++
		}
		m.adjustThreadListOffset()
		if m.loaded {
			return m.loadConversationCmd()
		}
		return m, nil

	case "k", "up":
		if m.cursor > 0 {
			m.cursor--
		}
		m.adjustThreadListOffset()
		if m.loaded {
			return m.loadConversationCmd()
		}
		return m, nil

	case "enter":
		m.loaded = true
		return m.loadConversationCmd()

	case "l", "tab":
		if m.activeThread != nil {
			m.focus = FocusConversation
		}
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

func (m Model) updateNormalConversation(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "q", "ctrl+c":
		return m, tea.Quit

	case "h", "tab":
		m.focus = FocusThreadList
		m.pendingG = false
		return m, nil

	case "i":
		m.mode = ModeInsert
		m.messageInput.Focus()
		m.pendingG = false
		return m, nil

	case "G":
		m.messageViewport.GotoBottom()
		m.pendingG = false
		return m, nil

	case "g":
		if m.pendingG {
			m.messageViewport.GotoTop()
			m.pendingG = false
		} else {
			m.pendingG = true
		}
		return m, nil

	default:
		m.pendingG = false
		// Forward to viewport for j/k scroll, u/d half-page, pgup/pgdn, etc.
		var cmd tea.Cmd
		m.messageViewport, cmd = m.messageViewport.Update(msg)
		return m, cmd
	}
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
			realIndex := visible[m.cursor]

			m.mode = ModeNormal
			m.searchInput.Blur()
			m.searchInput.SetValue("")
			m.filteredIndices = nil
			m.cursor = realIndex
			m.loaded = true
			return m.loadConversationCmd()
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
		if text != "" && m.activeThread != nil {
			// Optimistic local append for immediate UX.
			newMsg := Message{
				Text:      text,
				Timestamp: time.Now().UnixMicro(),
				UserId:    "me",
			}
			m.activeMessages = append(m.activeMessages, newMsg)
			m.messageInput.SetValue("")

			// Update viewport with new message.
			content := m.buildMessageContent()
			m.messageViewport.SetContent(content)
			m.messageViewport.GotoBottom()

			// Fire the backend send (will fail gracefully if not implemented).
			if m.rpc != nil {
				return m, sendMessageCmd(m.rpc, m.activeThread.ThreadID, text)
			}
		}
		m.messageInput.SetValue("")
		return m, nil
	}

	var cmd tea.Cmd
	m.messageInput, cmd = m.messageInput.Update(msg)
	return m, cmd
}

// loadConversationCmd sets the active thread and either returns cached messages
// immediately or fires an async fetch command.
func (m Model) loadConversationCmd() (tea.Model, tea.Cmd) {
	if len(m.threads) == 0 {
		return m, nil
	}
	if m.cursor >= len(m.threads) {
		m.cursor = len(m.threads) - 1
	}
	m.activeThread = &m.threads[m.cursor]

	// Cache hit — set messages immediately.
	if msgs, ok := m.conversationCache[m.activeThread.ThreadID]; ok {
		m.activeMessages = msgs
		content := m.buildMessageContent()
		m.messageViewport.SetContent(content)
		m.messageViewport.GotoBottom()
		return m, nil
	}

	// Cache miss — show loading and fetch from backend.
	m.activeMessages = nil
	m.messageViewport.SetContent("Loading messages...")
	m.statusMsg = "Loading messages..."
	if m.rpc != nil {
		return m, fetchMessagesCmd(m.rpc, m.activeThread.ThreadID)
	}
	return m, nil
}

// adjustThreadListOffset keeps the cursor within the visible window.
func (m *Model) adjustThreadListOffset() {
	bodyHeight := m.height - 2
	if bodyHeight < 3 {
		bodyHeight = 3
	}
	maxVisible := max(1, (bodyHeight-2)/3)

	if m.cursor < m.threadListOffset {
		m.threadListOffset = m.cursor
	}
	if m.cursor >= m.threadListOffset+maxVisible {
		m.threadListOffset = m.cursor - maxVisible + 1
	}
	if m.threadListOffset < 0 {
		m.threadListOffset = 0
	}
}

func (m *Model) filterThreads() {
	query := strings.ToLower(strings.TrimSpace(m.searchInput.Value()))

	if query == "" {
		m.filteredIndices = nil
		return
	}

	m.filteredIndices = []int{}
	for i, thread := range m.threads {
		for _, user := range thread.Users {
			if strings.Contains(strings.ToLower(user.Username), query) {
				m.filteredIndices = append(m.filteredIndices, i)
				break
			}
		}
	}
}
