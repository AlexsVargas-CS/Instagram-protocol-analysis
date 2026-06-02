package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
)

//header bar style
var headerStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("15")). 
	Background(lipgloss.Color("62")). 
	Padding(0, 1)

	//Thread lst
var selectedThreadStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("15")).
	Background(lipgloss.Color("60"))

// Dimmed selection — shown when the thread list is NOT the active pane (Read
// state), so the highlight reads as "remembered selection" rather than focus.
var selectedThreadDimStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("250")).
	Background(lipgloss.Color("238"))
var unselectedThreadStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("252"))


//unread marker
var unreadBadgeStyle = lipgloss.NewStyle(). 
	Foreground(lipgloss.Color("205")). // pink
	Bold(true)

//stat bar
var statusBarStyle = lipgloss.NewStyle(). 
	Foreground(lipgloss.Color("252")).
	Background(lipgloss.Color("236"))

//Mode indicator 
var modeStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("15")).  // white
	Background(lipgloss.Color("62")). // purple
	Padding(0, 1)

// convo message styles 
var myMessageStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("15")). 
	Background(lipgloss.Color("62")). 
	Padding(0, 1)

var theirMessageStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("252")). 
	Background(lipgloss.Color("237")). 
	Padding(0, 1)

var timestampStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("240"))

var usernameStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("86")). 
	Bold(true)
	
//Panel border left and right
var leftPanelBaseStyle = lipgloss.NewStyle().
	BorderRight(true).
	BorderStyle(lipgloss.NormalBorder()).
	BorderForeground(lipgloss.Color("240"))

var rightPanelBaseStyle = lipgloss.NewStyle()

var placeholderStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("240")). // dim gray
	Italic(true)

// Search bar style
var searchBarStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("86")) // cyan

// Login styles
var loginBoxStyle = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(lipgloss.Color("62")).
	Padding(1, 3)

var loginTitleStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("15")).
	MarginBottom(1)

var loginErrorStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("196")).
	Bold(true)

var loginLabelStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("252"))



func (m Model) View() string {

	if m.height == 0 || m.width == 0 {
		return "not yet rendered"
	}  
	//load header and stat bar
	header := m.renderHeader()
	statusBar := m.renderStatusBar()

	bodyHeight := m.height - 2

	if bodyHeight < 1 {
		bodyHeight = 1
	}

	// Login mode — render login screen instead of split panels
	if m.mode == ModeLogin {
		loginBody := m.renderLoginScreen(m.width, bodyHeight)
		return lipgloss.JoinVertical(lipgloss.Left, header, loginBody, statusBar)
	}

	leftWidth := m.width/3
	rightWidth := m.width - leftWidth -1

	leftPanel := m.renderThreadList(leftWidth, bodyHeight)
	rightPanel := m.renderConversation(rightWidth, bodyHeight)

	// Focus-aware border colors
	leftStyle := leftPanelBaseStyle
	rightStyle := rightPanelBaseStyle
	if m.focus == FocusThreadList {
		leftStyle = leftStyle.BorderForeground(lipgloss.Color("86"))
	} else {
		rightStyle = rightStyle.BorderLeft(true).
			BorderStyle(lipgloss.NormalBorder()).
			BorderForeground(lipgloss.Color("86"))
	}

	left := leftStyle.
		Width(leftWidth).
		Height(bodyHeight).
		Render(leftPanel)

	right := rightStyle.
		Width(rightWidth).
		Height(bodyHeight).
		Render(rightPanel)

body := lipgloss.JoinHorizontal(lipgloss.Top, left, right)

return lipgloss.JoinVertical(lipgloss.Left, header, body, statusBar)


}


func (m Model) renderHeader() string{
 title := "Instagram TUI"
 var status string
 if m.connected {
	status = fmt.Sprintf("Connected...| @%s", m.username)

 } else {
	status = "Disconnected..."
 }  
 spacerWidth := m.width - lipgloss.Width(title) - lipgloss.Width(status) - 2 // -2 for padding
	if spacerWidth < 1 {
		spacerWidth = 1
	} 
	spacer := strings.Repeat(" ", spacerWidth)

	return headerStyle.
		Width(m.width).
		Render(title + spacer + status)

}




func (m Model) renderThreadList(width, height int) string {
	var b strings.Builder

	// Search bar: only shown while actively searching. The "/ search" hint
	// now lives in the contextual status bar, not as an always-on header.
	if m.mode == ModeSearch {
		b.WriteString(searchBarStyle.Render("/ "))
		b.WriteString(m.searchInput.View())
		b.WriteString("\n\n")
	}

	// Determine which threads to display
	threads := m.getVisibleThreads()

	if len(threads) == 0 {
		if m.threads == nil {
			b.WriteString(placeholderStyle.Render("Loading threads..."))
		} else {
			b.WriteString(placeholderStyle.Render("No conversations"))
		}
		return b.String()
	}

	// Thread list scrolling — each thread takes ~3 lines (name + preview + gap)
	maxVisible := max(1, (height-2)/3) // subtract 2 for search bar + blank line
	offset := m.threadListOffset

	end := offset + maxVisible
	if end > len(threads) {
		end = len(threads)
	}
	visibleSlice := threads[offset:end]

	// Render each thread entry
	for vi, idx := range visibleSlice {
		i := offset + vi // logical index in full visible list
		thread := m.threads[idx]

		var indicator string
		if i == m.cursor {
			indicator = "> "
		} else {
			indicator = "  "
		}

		// Build display name from first user (or "Group" for group chats)
		displayName := getThreadDisplayName(thread)

		maxNameWidth := width - 8
		if maxNameWidth < 4 {
			maxNameWidth = 4
		}
		if lipgloss.Width(displayName) > maxNameWidth {
			runes := []rune(displayName)
			for len(runes) > 0 && lipgloss.Width(string(runes))+1 > maxNameWidth {
				runes = runes[:len(runes)-1]
			}
			displayName = string(runes) + "…"
		}

		// Unread badge
		var badge string
		if thread.UnreadCount > 0 {
			badge = unreadBadgeStyle.Render(fmt.Sprintf(" [%d]", thread.UnreadCount))
		}

		// Compose the line. The selected row dims when the conversation pane
		// holds focus (Read), keeping the spatial active-pane cue obvious.
		selStyle := selectedThreadStyle
		if m.focus == FocusConversation {
			selStyle = selectedThreadDimStyle
		}

		var line string
		if i == m.cursor {
			line = selStyle.Render(indicator+displayName) + badge
		} else {
			line = unselectedThreadStyle.Render(indicator+displayName) + badge
		}

		b.WriteString(line)

		// Preview of last message, dimmed, on the next line
		previewText := strings.ReplaceAll(thread.LastMessage.Text, "\n", " ")
		preview := truncate(previewText, width-4)
		if preview != "" {
			b.WriteString("\n")
			b.WriteString("  " + placeholderStyle.Render(preview))
		}

		b.WriteString("\n")
	}

	// Scroll indicators
	if offset > 0 {
		b.WriteString(placeholderStyle.Render(fmt.Sprintf("  ... %d more above", offset)))
		b.WriteString("\n")
	}
	remaining := len(threads) - end
	if remaining > 0 {
		b.WriteString(placeholderStyle.Render(fmt.Sprintf("  ... %d more below", remaining)))
		b.WriteString("\n")
	}

	return b.String()
}
func (m Model) renderConversation(width, height int) string {
	// No convo loaded, show placeholder
	if m.activeThread == nil {
		msg := "Press Enter to load conversation"
		return placeholderStyle.Render(msg)
	}

	var b strings.Builder

	// --- Header (static, 2 lines) ---
	displayName := getThreadDisplayName(*m.activeThread)
	header := lipgloss.NewStyle().
		Bold(true).
		Foreground(lipgloss.Color("15")).
		Render("@" + displayName)
	b.WriteString(header)
	b.WriteString("\n")

	// Scroll indicator or plain separator
	if !m.messageViewport.AtBottom() {
		scrollPct := int(m.messageViewport.ScrollPercent() * 100)
		indicator := fmt.Sprintf("── %d%% ──", scrollPct)
		b.WriteString(placeholderStyle.Render(indicator))
		// Fill rest of line with separator
		remaining := width - lipgloss.Width(indicator)
		if remaining > 0 {
			b.WriteString(placeholderStyle.Render(strings.Repeat("─", remaining)))
		}
	} else {
		b.WriteString(strings.Repeat("─", width))
	}
	b.WriteString("\n")

	// --- Viewport (scrollable messages) ---
	b.WriteString(m.messageViewport.View())
	b.WriteString("\n")

	// --- Input (static, 2 lines) ---
	b.WriteString("\n")
	if m.mode == ModeInsert {
		b.WriteString("> " + m.messageInput.View())
	} else {
		b.WriteString(placeholderStyle.Render("Press Enter to reply"))
	}

	return b.String()
}

func (m Model) renderLoginScreen(width, height int) string {
	var b strings.Builder

	// Browser fallback screen — shown when API challenge tiers failed.
	if m.loginStep == LoginStepChallengeUrl {
		b.WriteString(loginTitleStyle.Render("Manual Verification Required"))
		b.WriteString("\n\n")

		b.WriteString(loginLabelStyle.Render("Instagram requires verification that"))
		b.WriteString("\n")
		b.WriteString(loginLabelStyle.Render("could not be completed automatically."))
		b.WriteString("\n\n")

		b.WriteString(loginLabelStyle.Render("Open this URL in your browser:"))
		b.WriteString("\n\n")

		urlStyle := lipgloss.NewStyle().
			Foreground(lipgloss.Color("86")).
			Bold(true)
		b.WriteString(urlStyle.Render(m.challengeUrl))
		b.WriteString("\n\n")

		b.WriteString(loginLabelStyle.Render("Complete the verification, then"))
		b.WriteString("\n")
		b.WriteString(loginLabelStyle.Render("press Enter to retry login."))
		b.WriteString("\n\n")

		if m.loginError != "" {
			b.WriteString(loginErrorStyle.Render(m.loginError))
			b.WriteString("\n\n")
		}

		b.WriteString(placeholderStyle.Render("Enter: retry login  Esc: quit"))

		box := loginBoxStyle.Render(b.String())
		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
	}

	// 2FA code entry screen — shown when account has authenticator/SMS 2FA.
	if m.loginStep == LoginStepTwoFactor {
		b.WriteString(loginTitleStyle.Render("Two-Factor Authentication"))
		b.WriteString("\n\n")

		hint := m.twoFactorHint
		if hint == "" {
			hint = "Enter your 2FA code"
		}
		b.WriteString(loginLabelStyle.Render(hint))
		b.WriteString("\n\n")

		b.WriteString(loginLabelStyle.Render("Code:"))
		b.WriteString("\n")
		b.WriteString(m.challengeInput.View())
		b.WriteString("\n\n")

		if m.loginError != "" {
			b.WriteString(loginErrorStyle.Render(m.loginError))
			b.WriteString("\n\n")
		}

		b.WriteString(placeholderStyle.Render("Enter: verify  Esc: quit"))

		box := loginBoxStyle.Render(b.String())
		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
	}

	// Challenge verification screen — shown after checkpoint is triggered.
	if m.loginStep == LoginStepChallenge {
		b.WriteString(loginTitleStyle.Render("Verify Your Identity"))
		b.WriteString("\n\n")

		hint := "Enter the verification code sent to " + m.challengeHint
		b.WriteString(loginLabelStyle.Render(hint))
		b.WriteString("\n\n")

		b.WriteString(loginLabelStyle.Render("Verification Code:"))
		b.WriteString("\n")
		b.WriteString(m.challengeInput.View())
		b.WriteString("\n\n")

		if m.loginError != "" {
			b.WriteString(loginErrorStyle.Render(m.loginError))
			b.WriteString("\n\n")
		}

		b.WriteString(placeholderStyle.Render("Enter: verify  Esc: quit"))

		box := loginBoxStyle.Render(b.String())
		return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
	}

	// Normal login screen — username / password entry.
	b.WriteString(loginTitleStyle.Render("Instagram Login"))
	b.WriteString("\n\n")

	// Username field
	b.WriteString(loginLabelStyle.Render("Username:"))
	b.WriteString("\n")
	if m.loginStep == LoginStepUsername {
		b.WriteString(m.usernameInput.View())
	} else {
		b.WriteString(loginLabelStyle.Render(m.usernameInput.Value()))
	}
	b.WriteString("\n\n")

	// Password field
	b.WriteString(loginLabelStyle.Render("Password:"))
	b.WriteString("\n")
	if m.loginStep == LoginStepPassword {
		b.WriteString(m.passwordInput.View())
	} else {
		b.WriteString(loginLabelStyle.Render(strings.Repeat("*", len(m.passwordInput.Value()))))
	}
	b.WriteString("\n\n")

	// Error message
	if m.loginError != "" {
		b.WriteString(loginErrorStyle.Render(m.loginError))
		b.WriteString("\n\n")
	}

	// Hint
	b.WriteString(placeholderStyle.Render("Enter: next/submit  Tab: switch field  Esc: quit"))

	box := loginBoxStyle.Render(b.String())

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
}

// buildMessageContent renders all messages into a string for the viewport.
func (m Model) buildMessageContent() string {
	if m.activeMessages == nil {
		return placeholderStyle.Render("Loading messages...")
	}
	if len(m.activeMessages) == 0 {
		return placeholderStyle.Render("No messages yet")
	}

	var b strings.Builder

	// Pagination indicator at top
	if m.activeThread != nil {
		threadID := m.activeThread.ThreadID
		if m.loadingOlder {
			b.WriteString(placeholderStyle.Render("Loading older messages...") + "\n\n")
		} else if !m.hasOlderCache[threadID] {
			b.WriteString(placeholderStyle.Render("--- Beginning of conversation ---") + "\n\n")
		}
	}

	b.WriteString(m.renderMessages(m.activeMessages))

	return b.String()
}

// renderMessages renders a slice of messages into a string.
func (m Model) renderMessages(messages []Message) string {
	w := m.viewportWidth()
	var b strings.Builder

	for _, msg := range messages {
		ts := formatTimestamp(msg.Timestamp)
		isMe := msg.UserId == m.userPK

		if isMe {
			// Right-aligned: my messages
			bubble := myMessageStyle.Render(msg.Text)
			bubbleWidth := lipgloss.Width(bubble)
			pad := w - bubbleWidth
			if pad < 0 {
				pad = 0
			}
			b.WriteString(strings.Repeat(" ", pad) + bubble + "\n")
			// Right-align timestamp too
			tsRendered := timestampStyle.Render(ts)
			tsPad := w - lipgloss.Width(tsRendered)
			if tsPad < 0 {
				tsPad = 0
			}
			b.WriteString(strings.Repeat(" ", tsPad) + tsRendered + "\n\n")
		} else {
			// Left-aligned: their messages with username label
			sender := usernameStyle.Render(getUsernameById(m.activeThread.Users, msg.UserId))
			b.WriteString(sender + "\n")
			b.WriteString(theirMessageStyle.Render(msg.Text) + "\n")
			b.WriteString(timestampStyle.Render(ts) + "\n\n")
		}
	}

	return b.String()
}

func (m Model) renderStatusBar() string {
	// Contextual keybinding hints — only the keys valid for the current state.
	// Hidden vim aliases (h/j/k/l) are intentionally undocumented here.
	var keys string
	switch m.mode {
	case ModeNormal:
		if m.focus == FocusConversation {
			keys = "↑↓ scroll   ⏎ reply   ← back"
		} else {
			keys = "↑↓ navigate   → open   / search   q quit"
		}
	case ModeSearch:
		keys = "Type to filter  Enter: select  Esc: cancel"
	case ModeInsert:
		keys = "⏎ send   esc cancel"
	case ModeLogin:
		if m.loginStep == LoginStepChallengeUrl {
			keys = "Enter: retry login  Esc: quit"
		} else if m.loginStep == LoginStepChallenge || m.loginStep == LoginStepTwoFactor {
			keys = "Enter: verify  Esc: quit"
		} else {
			keys = "Enter: next/submit  Tab: switch field  Esc: quit"
		}
	}

	// Show status message if present, otherwise show keybindings.
	left := keys
	if m.statusMsg != "" {
		left = m.statusMsg + "  |  " + keys
	}

	// State badge on the right — BROWSE / READ / COMPOSE (spatial-model name).
	modeBadge := modeStyle.Render(m.stateName())

	spacerWidth := m.width - lipgloss.Width(left) - lipgloss.Width(modeBadge) - 2
	if spacerWidth < 1 {
		spacerWidth = 1
	}
	spacer := strings.Repeat(" ", spacerWidth)

	return statusBarStyle.
		Width(m.width).
		Render(left + spacer + modeBadge)
}





func (m Model) getVisibleThreads() []int {
	if m.filteredIndices != nil {
		return m.filteredIndices
	}

	// No search active — return all thread indices
	indices := make([]int, len(m.threads))
	for i := range m.threads {
		indices[i] = i
	}
	return indices
}

func getThreadDisplayName(t Thread) string {
	if t.IsGroup {
		if len(t.Users) > 0 {
			names := make([]string, 0, len(t.Users))
			for _, u := range t.Users {
				names = append(names, u.Username)
			}
			return strings.Join(names, ", ")
		}
		return "Group Chat"
	}

	if len(t.Users) > 0 {
		return t.Users[0].Username
	}
	return "Unknown"
}



func formatTimestamp(ts int64) string {
	if ts == 0 {
		return ""
	}
	var t time.Time
	if ts > 1_000_000_000_000 {
		t = time.Unix(ts/1_000_000, 0)
	} else {
		t = time.Unix(ts, 0)
	}

	now := time.Now()
	if t.Year() == now.Year() && t.YearDay() == now.YearDay() {
		return t.Format("3:04 PM")
	}
	return t.Format("Jan 2, 3:04 PM")
	
}

// getUsernameById finds a username from the thread's user list by PK.
func getUsernameById(users []User, userId string) string {
	for _, u := range users {
		if u.PK == userId {
			return u.Username
		}
	}
	return "unknown"
}

// truncate shortens a string to maxLen display width, adding "…" if truncated.
// Uses rune slicing to avoid corrupting multi-byte UTF-8 characters.
func truncate(s string, maxLen int) string {
	if maxLen < 4 {
		maxLen = 4
	}
	if lipgloss.Width(s) <= maxLen {
		return s
	}
	runes := []rune(s)
	for len(runes) > 0 && lipgloss.Width(string(runes))+1 > maxLen {
		runes = runes[:len(runes)-1]
	}
	return string(runes) + "…"
}