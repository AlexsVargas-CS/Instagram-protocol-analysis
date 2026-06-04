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
		if msg.User != nil {
			m.userPK = msg.User.PK
			m.username = msg.User.Username
		}
		var cmds []tea.Cmd
		if m.rpc != nil {
			cmds = append(cmds, listenForBackendEvents(m.rpc))
		}
		if msg.Success {
			m.statusMsg = "Session restored"
			if m.rpc != nil {
				cmds = append(cmds, fetchThreadsCmd(m.rpc))
			}
		} else {
			m.statusMsg = "No session found — please log in"
			m.mode = ModeLogin
			m.loginStep = LoginStepUsername
			m.usernameInput.Focus()
		}
		return m, tea.Batch(cmds...)

	case BackendDisconnectedMsg:
		m.connected = false
		m.statusMsg = "Backend disconnected"
		return m, nil

	case ThreadsLoadedMsg:
		if msg.Err != nil {
			if isSessionExpired(msg.Err) {
				return m, m.enterRelogin("Session expired — please log in again.")
			}
			m.statusMsg = "Failed to load threads: " + msg.Err.Error()
			return m, nil
		}
		// Remember which thread was active before replacing the list.
		var activeThreadID string
		if m.activeThread != nil {
			activeThreadID = m.activeThread.ThreadID
		}

		m.threads = msg.Threads

		// Deduplicate threads by ThreadID (Instagram API can return duplicates).
		seen := make(map[string]bool)
		deduped := m.threads[:0]
		for _, t := range m.threads {
			if !seen[t.ThreadID] {
				seen[t.ThreadID] = true
				deduped = append(deduped, t)
			}
		}
		m.threads = deduped

		// Clamp cursor to new list bounds.
		if len(m.threads) == 0 {
			m.cursor = 0
		} else if m.cursor >= len(m.threads) {
			m.cursor = len(m.threads) - 1
		}

		// Re-establish activeThread pointer by matching ThreadID.
		if activeThreadID != "" {
			m.activeThread = nil
			for i := range m.threads {
				if m.threads[i].ThreadID == activeThreadID {
					m.activeThread = &m.threads[i]
					break
				}
			}
		}

		m.statusMsg = "Threads loaded"
		return m, nil

	case MessagesLoadedMsg:
		if msg.Err != nil {
			m.loadingOlder = false
			if isSessionExpired(msg.Err) {
				return m, m.enterRelogin("Session expired — please log in again.")
			}
			m.statusMsg = "Failed to load messages: " + msg.Err.Error()
			return m, nil
		}
		// Store pagination metadata.
		if msg.OldestCursor != nil {
			m.cursorCache[msg.ThreadID] = *msg.OldestCursor
		}
		m.hasOlderCache[msg.ThreadID] = msg.HasOlder

		if msg.IsOlderPage {
			// Prepend older messages to existing cache.
			existing := m.conversationCache[msg.ThreadID]
			merged := make([]Message, 0, len(msg.Messages)+len(existing))
			merged = append(merged, msg.Messages...)
			merged = append(merged, existing...)
			m.conversationCache[msg.ThreadID] = merged
			m.loadingOlder = false

			if m.activeThread != nil && m.activeThread.ThreadID == msg.ThreadID {
				m.activeMessages = merged
				prependedContent := m.renderMessages(msg.Messages)
				addedLines := strings.Count(prependedContent, "\n")
				newContent := m.buildMessageContent()
				m.messageViewport.SetContent(newContent)
				if addedLines > 0 {
					m.messageViewport.SetYOffset(addedLines)
				}
			}
		} else {
			// Initial load — replace cache and scroll to bottom.
			m.conversationCache[msg.ThreadID] = msg.Messages
			if m.activeThread != nil && m.activeThread.ThreadID == msg.ThreadID {
				m.activeMessages = msg.Messages
				content := m.buildMessageContent()
				m.messageViewport.SetContent(content)
				m.messageViewport.GotoBottom()
				// Mark latest message as read.
				if m.rpc != nil && m.activeThread.UnreadCount > 0 && len(msg.Messages) > 0 {
					lastMsg := msg.Messages[len(msg.Messages)-1]
					if lastMsg.ItemId != "" {
						m.statusMsg = ""
						return m, markReadCmd(m.rpc, m.activeThread.ThreadID, lastMsg.ItemId)
					}
				}
			}
		}
		m.statusMsg = ""
		return m, nil

	case MessageSentMsg:
		if msg.Err != nil {
			if isSessionExpired(msg.Err) {
				return m, m.enterRelogin("Session expired — please log in again.")
			}
			m.statusMsg = "Send failed: " + msg.Err.Error()
		}
		return m, nil

	case MarkReadMsg:
		if msg.Err != nil {
			// markRead failing is non-critical, but a session-expired error
			// here is the same signal as elsewhere — prompt re-login.
			if isSessionExpired(msg.Err) {
				return m, m.enterRelogin("Session expired — please log in again.")
			}
			return m, nil
		}
		// Zero out unread count in the thread list.
		for i := range m.threads {
			if m.threads[i].ThreadID == msg.ThreadID {
				m.threads[i].UnreadCount = 0
				break
			}
		}
		return m, nil

	case NewMessageMsg:
		// Bug 10 fix: if thread isn't in cache, create a new entry instead of dropping.
		if existing, ok := m.conversationCache[msg.ThreadID]; ok {
			m.conversationCache[msg.ThreadID] = append(existing, msg.Message)
		} else {
			if m.conversationCache == nil {
				m.conversationCache = make(map[string][]Message)
			}
			m.conversationCache[msg.ThreadID] = []Message{msg.Message}
		}

		// Update thread list: LastMessage, UnreadCount, LastActivityAt.
		viewingThis := m.activeThread != nil && m.activeThread.ThreadID == msg.ThreadID
		threadIdx := -1
		for i := range m.threads {
			if m.threads[i].ThreadID == msg.ThreadID {
				m.threads[i].LastMessage = msg.Message
				m.threads[i].LastActivityAt = msg.Message.Timestamp
				if !viewingThis {
					m.threads[i].UnreadCount++
				}
				threadIdx = i
				break
			}
		}

		// Bug 3 fix: bubble the thread to position 0 if it's not already there.
		if threadIdx > 0 {
			thread := m.threads[threadIdx]
			copy(m.threads[1:threadIdx+1], m.threads[0:threadIdx])
			m.threads[0] = thread

			// Adjust cursor to track the user's selected thread through the reorder.
			if m.cursor == threadIdx {
				m.cursor = 0
			} else if m.cursor < threadIdx {
				m.cursor++
			}

			// Re-establish activeThread pointer after slice mutation.
			if m.activeThread != nil {
				for i := range m.threads {
					if m.threads[i].ThreadID == m.activeThread.ThreadID {
						m.activeThread = &m.threads[i]
						break
					}
				}
			}
		}

		// If currently viewing this thread, update the viewport.
		if viewingThis {
			m.activeMessages = m.conversationCache[msg.ThreadID]
			atBottom := m.messageViewport.AtBottom()
			content := m.buildMessageContent()
			m.messageViewport.SetContent(content)
			if atBottom {
				m.messageViewport.GotoBottom()
			}
		}

		// Re-issue the event listener.
		if m.rpc != nil {
			return m, listenForBackendEvents(m.rpc)
		}
		return m, nil

	case RealtimeErrorMsg:
		m.statusMsg = "Realtime: " + msg.Error
		if m.rpc != nil {
			return m, listenForBackendEvents(m.rpc)
		}
		return m, nil

	case LoginResultMsg:
		if msg.Err != nil {
			errMsg := msg.Err.Error()

			// Check if the backend triggered a challenge and sent a code.
			// The error message will contain "Verification code sent to <contact>".
			if strings.Contains(errMsg, "Verification code sent") {
				m.loginStep = LoginStepChallenge
				// Extract the masked contact point (e.g. "a***@g***.com")
				if idx := strings.Index(errMsg, "sent to "); idx != -1 {
					m.challengeHint = errMsg[idx+len("sent to "):]
				} else {
					m.challengeHint = "your phone or email"
				}
				m.challengeInput.SetValue("")
				m.challengeInput.Focus()
				m.passwordInput.Blur()
				m.loginError = ""
				m.statusMsg = ""
				return m, nil
			}

			// Check if the backend fell back to a browser challenge URL.
			// RPC wraps the error as "rpc error -32001: challenge_url:https://..."
			if idx := strings.Index(errMsg, "challenge_url:"); idx != -1 {
				m.challengeUrl = errMsg[idx+len("challenge_url:"):]
				m.loginStep = LoginStepChallengeUrl
				m.passwordInput.Blur()
				m.loginError = ""
				m.statusMsg = ""
				return m, nil
			}

			// Detect 2FA requirement.
			// Error format: "rpc error -32001: two_factor:totp:Enter code from your authenticator app"
			if idx := strings.Index(errMsg, "two_factor:"); idx != -1 {
				payload := errMsg[idx+len("two_factor:"):]
				// payload is "totp:Enter code from..." or "sms:Enter SMS code..."
				if hintIdx := strings.Index(payload, ":"); hintIdx != -1 {
					m.twoFactorHint = payload[hintIdx+1:]
				} else {
					m.twoFactorHint = "Enter your 2FA code"
				}
				m.loginStep = LoginStepTwoFactor
				m.challengeInput.SetValue("")
				m.challengeInput.Focus()
				m.passwordInput.Blur()
				m.loginError = ""
				m.statusMsg = ""
				return m, nil
			}

			if strings.Contains(errMsg, "password") || strings.Contains(errMsg, "bad_credentials") {
				m.loginError = "Incorrect password. Please try again."
			} else if strings.Contains(errMsg, "checkpoint") || strings.Contains(errMsg, "challenge") || strings.Contains(errMsg, "Challenge") {
				m.loginError = "Checkpoint required. Try deleting session.json and retrying, or check stderr for details."
			} else if strings.Contains(errMsg, "two_factor") || strings.Contains(errMsg, "Two-factor") {
				m.loginError = "Two-factor authentication required."
			} else {
				m.loginError = "Login failed: " + errMsg
			}
			m.loginStep = LoginStepUsername
			m.usernameInput.Focus()
			m.passwordInput.Blur()
			m.statusMsg = ""
			return m, nil
		}
		m.connected = true
		m.username = msg.User.Username
		m.userPK = msg.User.PK
		m.mode = ModeNormal
		m.loginError = ""
		m.challengeUrl = ""
		m.usernameInput.SetValue("")
		m.passwordInput.SetValue("")
		m.usernameInput.Blur()
		m.passwordInput.Blur()
		m.statusMsg = "Logged in"
		if m.rpc != nil {
			// Don't re-issue listenForBackendEvents — it's already running
			// from the SessionRestoredMsg handler.
			return m, fetchThreadsCmd(m.rpc)
		}
		return m, nil

	case ChallengeResultMsg:
		if msg.Err != nil {
			m.loginError = "Verification failed: " + msg.Err.Error()
			m.challengeInput.SetValue("")
			m.challengeInput.Focus()
			m.statusMsg = ""
			return m, nil
		}
		// Challenge succeeded — user is logged in.
		m.connected = true
		m.username = msg.User.Username
		m.userPK = msg.User.PK
		m.mode = ModeNormal
		m.loginError = ""
		m.loginStep = LoginStepUsername
		m.challengeUrl = ""
		m.usernameInput.SetValue("")
		m.passwordInput.SetValue("")
		m.challengeInput.SetValue("")
		m.challengeHint = ""
		m.usernameInput.Blur()
		m.passwordInput.Blur()
		m.challengeInput.Blur()
		m.statusMsg = "Logged in"
		if m.rpc != nil {
			// Don't re-issue listenForBackendEvents — it's already running.
			return m, fetchThreadsCmd(m.rpc)
		}
		return m, nil

	case TwoFactorResultMsg:
		if msg.Err != nil {
			m.loginError = "2FA verification failed: " + msg.Err.Error()
			m.challengeInput.SetValue("")
			m.challengeInput.Focus()
			m.statusMsg = ""
			return m, nil
		}
		// 2FA succeeded — user is logged in.
		m.connected = true
		m.username = msg.User.Username
		m.userPK = msg.User.PK
		m.mode = ModeNormal
		m.loginError = ""
		m.loginStep = LoginStepUsername
		m.twoFactorHint = ""
		m.challengeUrl = ""
		m.usernameInput.SetValue("")
		m.passwordInput.SetValue("")
		m.challengeInput.SetValue("")
		m.usernameInput.Blur()
		m.passwordInput.Blur()
		m.challengeInput.Blur()
		m.statusMsg = "Logged in"
		if m.rpc != nil {
			return m, fetchThreadsCmd(m.rpc)
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
		case ModeLogin:
			return m.updateLoginMode(msg)
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
			return m.showCachedConversation()
		}
		return m, nil

	case "k", "up":
		if m.cursor > 0 {
			m.cursor--
		}
		m.adjustThreadListOffset()
		if m.loaded {
			return m.showCachedConversation()
		}
		return m, nil

	// Enter / → / l — advance: open the selected thread and move to Read.
	// (l is the hidden vim alias for →.)
	case "enter", "right", "l":
		if len(m.getVisibleThreads()) == 0 {
			return m, nil
		}
		m.loaded = true
		m.focus = FocusConversation
		return m.loadConversationCmd()

	case "/":
		m.mode = ModeSearch
		m.preSearchCursor = m.cursor
		m.searchInput.Focus()
		m.cursor = 0
		return m, nil
	}

	// ← / h are no-ops in Browse — it is the leftmost layer.
	return m, nil
}

func (m Model) updateNormalConversation(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {

	case "q", "ctrl+c":
		return m, tea.Quit

	// ← / h / Esc — back one layer to Browse. (h is the hidden vim alias for ←.)
	case "left", "h", "esc":
		m.focus = FocusThreadList
		m.pendingG = false
		return m, nil

	// Enter — advance to Compose. (i kept as a silent vim-insert alias.)
	case "enter", "i":
		m.mode = ModeInsert
		m.messageInput.Focus()
		m.pendingG = false
		return m, nil

	// → / l — no layer to advance to from Read; swallow so it doesn't scroll.
	case "right", "l":
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
			// Trigger load-older when reaching top
			if cmd := m.loadOlderCmd(); cmd != nil {
				return m, cmd
			}
		} else {
			m.pendingG = true
		}
		return m, nil

	default:
		m.pendingG = false
		// Forward to viewport for j/k scroll, u/d half-page, pgup/pgdn, etc.
		var cmd tea.Cmd
		m.messageViewport, cmd = m.messageViewport.Update(msg)
		// Trigger load-older when scrolling to top
		if m.messageViewport.AtTop() {
			if olderCmd := m.loadOlderCmd(); olderCmd != nil {
				return m, tea.Batch(cmd, olderCmd)
			}
		}
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
		// Restore cursor to pre-search position, clamped to bounds.
		m.cursor = m.preSearchCursor
		if m.cursor >= len(m.threads) {
			m.cursor = max(0, len(m.threads)-1)
		}
		return m, nil

	case "enter":
		visible := m.getVisibleThreads()
		if len(visible) > 0 && m.cursor < len(visible) {
			realIndex := visible[m.cursor]

			m.mode = ModeNormal
			m.focus = FocusConversation
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

	// Esc — discard the in-progress input and return to Read.
	case "esc":
		m.mode = ModeNormal
		m.focus = FocusConversation
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
				UserId:    m.userPK,
			}
			m.activeMessages = append(m.activeMessages, newMsg)
			m.conversationCache[m.activeThread.ThreadID] = m.activeMessages
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
		// Mark the latest message as read if there are unread messages.
		if m.rpc != nil && m.activeThread.UnreadCount > 0 && len(msgs) > 0 {
			lastMsg := msgs[len(msgs)-1]
			if lastMsg.ItemId != "" {
				return m, markReadCmd(m.rpc, m.activeThread.ThreadID, lastMsg.ItemId)
			}
		}
		return m, nil
	}

	// Cache miss — show loading and fetch from backend.
	m.activeMessages = nil
	m.messageViewport.SetContent("Loading messages...")
	m.statusMsg = "Loading messages..."
	if m.rpc != nil {
		return m, fetchMessagesCmd(m.rpc, m.activeThread.ThreadID, "", false)
	}
	return m, nil
}

// showCachedConversation points activeThread at the highlighted thread and shows
// its messages from cache if present. Unlike loadConversationCmd it NEVER issues
// a backend fetch — navigating the list with j/k must not hit the Instagram API
// on every keystroke (rate-limit / checkpoint risk). Explicit opens (Enter/l)
// still use loadConversationCmd, which fetches on a cache miss.
func (m Model) showCachedConversation() (tea.Model, tea.Cmd) {
	if len(m.threads) == 0 {
		return m, nil
	}
	if m.cursor >= len(m.threads) {
		m.cursor = len(m.threads) - 1
	}
	m.activeThread = &m.threads[m.cursor]

	if msgs, ok := m.conversationCache[m.activeThread.ThreadID]; ok {
		m.activeMessages = msgs
		content := m.buildMessageContent()
		m.messageViewport.SetContent(content)
		m.messageViewport.GotoBottom()
		return m, nil
	}

	// Cache miss — show a hint instead of fetching. Open with Enter/l to load.
	m.activeMessages = nil
	m.messageViewport.SetContent(placeholderStyle.Render("Press Enter to load conversation"))
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

// loadOlderCmd returns a command to fetch older messages if conditions are met.
func (m *Model) loadOlderCmd() tea.Cmd {
	if m.activeThread == nil || m.loadingOlder {
		return nil
	}
	threadID := m.activeThread.ThreadID
	if !m.hasOlderCache[threadID] {
		return nil
	}
	cursor, ok := m.cursorCache[threadID]
	if !ok || cursor == "" {
		return nil
	}
	m.loadingOlder = true
	return fetchMessagesCmd(m.rpc, threadID, cursor, true)
}

// isSessionExpired reports whether an RPC error means the Instagram session is
// no longer valid. The backend raises SessionError for this, which the RPC layer
// surfaces as "rpc error -32001: Session expired ...". Match on the message text
// (not a prefix) since the code is shared with auth errors.
func isSessionExpired(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "Session expired") || strings.Contains(s, "log in again")
}

// enterRelogin drops the UI back to the username login step after the session
// expires mid-use, pre-filling the known username for convenience. The backend
// child stays alive, so re-login reuses the same process and event listener.
func (m *Model) enterRelogin(reason string) tea.Cmd {
	m.connected = false
	m.mode = ModeLogin
	m.loginStep = LoginStepUsername
	m.activeThread = nil
	m.activeMessages = nil
	m.loadingOlder = false
	m.loginError = reason
	if m.username != "" {
		m.usernameInput.SetValue(m.username)
	}
	m.passwordInput.SetValue("")
	m.passwordInput.Blur()
	return m.usernameInput.Focus()
}

func (m Model) updateLoginMode(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "ctrl+c", "esc":
		return m, tea.Quit

	case "tab", "shift+tab":
		// No field switching during challenge, URL, or 2FA steps.
		if m.loginStep == LoginStepChallenge || m.loginStep == LoginStepChallengeUrl || m.loginStep == LoginStepTwoFactor {
			return m, nil
		}
		if m.loginStep == LoginStepUsername {
			m.loginStep = LoginStepPassword
			m.usernameInput.Blur()
			m.passwordInput.Focus()
		} else {
			m.loginStep = LoginStepUsername
			m.passwordInput.Blur()
			m.usernameInput.Focus()
		}
		return m, nil

	case "enter":
		if m.loginStep == LoginStepUsername {
			if strings.TrimSpace(m.usernameInput.Value()) == "" {
				m.loginError = "Username cannot be empty"
				return m, nil
			}
			m.loginStep = LoginStepPassword
			m.loginError = ""
			m.usernameInput.Blur()
			m.passwordInput.Focus()
			return m, nil
		}
		if m.loginStep == LoginStepPassword {
			if strings.TrimSpace(m.passwordInput.Value()) == "" {
				m.loginError = "Password cannot be empty"
				return m, nil
			}
			m.loginError = ""
			m.statusMsg = "Logging in..."
			m.passwordInput.Blur()
			if m.rpc != nil {
				return m, loginCmd(m.rpc, m.usernameInput.Value(), m.passwordInput.Value())
			}
			return m, nil
		}
		if m.loginStep == LoginStepChallenge {
			code := strings.TrimSpace(m.challengeInput.Value())
			if code == "" {
				m.loginError = "Verification code cannot be empty"
				return m, nil
			}
			m.loginError = ""
			m.statusMsg = "Verifying..."
			m.challengeInput.Blur()
			if m.rpc != nil {
				return m, submitChallengeCmd(m.rpc, code)
			}
			return m, nil
		}
		if m.loginStep == LoginStepChallengeUrl {
			// Retry login after user completes browser verification.
			m.loginError = ""
			m.statusMsg = "Retrying login..."
			if m.rpc != nil {
				return m, loginCmd(m.rpc, m.usernameInput.Value(), m.passwordInput.Value())
			}
			return m, nil
		}
		if m.loginStep == LoginStepTwoFactor {
			code := strings.TrimSpace(m.challengeInput.Value())
			if code == "" {
				m.loginError = "2FA code cannot be empty"
				return m, nil
			}
			m.loginError = ""
			m.statusMsg = "Verifying 2FA..."
			m.challengeInput.Blur()
			if m.rpc != nil {
				return m, submitTwoFactorCmd(m.rpc, code)
			}
			return m, nil
		}
		return m, nil
	}

	// Forward to active input (no input for URL step).
	if m.loginStep == LoginStepChallengeUrl {
		return m, nil
	}
	var cmd tea.Cmd
	if m.loginStep == LoginStepUsername {
		m.usernameInput, cmd = m.usernameInput.Update(msg)
	} else if m.loginStep == LoginStepPassword {
		m.passwordInput, cmd = m.passwordInput.Update(msg)
	} else {
		// LoginStepChallenge and LoginStepTwoFactor both use challengeInput.
		m.challengeInput, cmd = m.challengeInput.Update(msg)
	}
	return m, cmd
}
