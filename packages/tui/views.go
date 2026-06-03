package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
)

// ============================================================================
// Design tokens — the single source of truth for the palette. Keep hex
// literals here; do not scatter them through the render functions.
// ============================================================================
var (
	colPink    = lipgloss.Color("#FF3FA4") // title
	colPurple  = lipgloss.Color("#7C5CFC") // accent: sent bubbles, borders, badges, handle
	colSelBg   = lipgloss.Color("#221E33") // selected-thread tinted background
	colDarkBub = lipgloss.Color("#2A2A33") // received-bubble fill
	colGreen   = lipgloss.Color("#3FB950") // online dot, sender name, "API: Connected"
	colBlue    = lipgloss.Color("#58A6FF") // "Sync: Real-time" info icon
	colGray    = lipgloss.Color("#8B8B96") // timestamps, previews, secondary chrome
	colWhite   = lipgloss.Color("#FFFFFF") // primary text
)

// ---- Top app bar ----
var headerStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(colWhite).
	Background(colPurple).
	Padding(0, 1)

// ---- Sidebar chrome ----
var sidebarTitleStyle = lipgloss.NewStyle().Bold(true).Foreground(colPink)
var mutedStyle = lipgloss.NewStyle().Foreground(colGray)
var onlineDotStyle = lipgloss.NewStyle().Foreground(colGreen)
var sectionHeaderStyle = lipgloss.NewStyle().Bold(true).Foreground(colGray)

// Count / status pill: accent background, white text, 1 cell horizontal padding.
var badgeStyle = lipgloss.NewStyle().
	Background(colPurple).
	Foreground(colWhite).
	Padding(0, 1)

// ---- Thread rows ----
var threadNameStyle = lipgloss.NewStyle().Bold(true).Foreground(colWhite)
var previewStyle = lipgloss.NewStyle().Italic(true).Foreground(colGray)
var timestampStyle = lipgloss.NewStyle().Foreground(colGray)

// Selected row: left accent bar (left border) + subtly tinted background.
var selectedRowStyle = lipgloss.NewStyle().
	Border(lipgloss.NormalBorder(), false, false, false, true).
	BorderForeground(colPurple).
	Background(colSelBg)

// Unselected row: a 1-col indent so its text lines up with the bordered row.
var unselectedRowStyle = lipgloss.NewStyle().PaddingLeft(1)

var unreadBadgeStyle = lipgloss.NewStyle().Foreground(colPink).Bold(true)

// ---- STATUS block icons ----
var statusOkStyle = lipgloss.NewStyle().Foreground(colGreen)
var statusInfoStyle = lipgloss.NewStyle().Foreground(colBlue)
var statusClockStyle = lipgloss.NewStyle().Foreground(colGray)

// ---- Conversation pane ----
var convNameStyle = lipgloss.NewStyle().Bold(true).Foreground(colWhite)
var convHandleStyle = lipgloss.NewStyle().Foreground(colPurple)
var ruleStyle = lipgloss.NewStyle().Foreground(colPurple)
var dividerStyle = lipgloss.NewStyle().Foreground(colGray)
var recvSenderStyle = lipgloss.NewStyle().Foreground(colGreen).Bold(true)

// Message bubbles. Border color matches the fill so the rounded corners read
// as part of the bubble. No Width is set — bubbles hug pre-wrapped text.
var sentBubbleStyle = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(colPurple).
	Background(colPurple).
	Foreground(colWhite).
	Padding(0, 1)

var recvBubbleStyle = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(colDarkBub).
	Background(colDarkBub).
	Foreground(colWhite).
	Padding(0, 1)

// ---- Input box + decorative Send button ----
var inputBoxStyle = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(colPurple).
	Padding(0, 1)

var sendButtonStyle = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(colPurple).
	Background(colPurple).
	Foreground(colWhite).
	Bold(true).
	Padding(0, 1).
	MarginLeft(1)

// ---- Status / key bar ----
var statusBarStyle = lipgloss.NewStyle().
	Foreground(colWhite).
	Background(lipgloss.Color("236"))

var modeStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(colWhite).
	Background(colPurple).
	Padding(0, 1)

var placeholderStyle = lipgloss.NewStyle().
	Foreground(colGray).
	Italic(true)

var searchBarStyle = lipgloss.NewStyle().Foreground(colPurple)

// ---- Panel borders (focus-aware swap happens in View) ----
var leftPanelBaseStyle = lipgloss.NewStyle().
	BorderRight(true).
	BorderStyle(lipgloss.NormalBorder()).
	BorderForeground(colGray)

var rightPanelBaseStyle = lipgloss.NewStyle()

// ---- Login styles ----
var loginBoxStyle = lipgloss.NewStyle().
	Border(lipgloss.RoundedBorder()).
	BorderForeground(colPurple).
	Padding(1, 3)

var loginTitleStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(colWhite).
	MarginBottom(1)

var loginErrorStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("#FF6B6B")).
	Bold(true)

var loginLabelStyle = lipgloss.NewStyle().Foreground(colWhite)

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

	leftWidth := m.width / 3
	rightWidth := m.width - leftWidth - 1

	leftPanel := m.renderThreadList(leftWidth, bodyHeight)
	rightPanel := m.renderConversation(rightWidth, bodyHeight)

	// Focus-aware border colors — accent on the active pane, dim gray on the
	// other. This is the highest-impact polish cue, wired to the real focus
	// state (m.focus), not a new field.
	leftStyle := leftPanelBaseStyle
	rightStyle := rightPanelBaseStyle
	if m.focus == FocusThreadList {
		leftStyle = leftStyle.BorderForeground(colPurple)
	} else {
		rightStyle = rightStyle.BorderLeft(true).
			BorderStyle(lipgloss.NormalBorder()).
			BorderForeground(colPurple)
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

func (m Model) renderHeader() string {
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

	// --- Title + connection line ---
	b.WriteString(sidebarTitleStyle.Render("INSTAGRAM TUI"))
	b.WriteString("\n")
	if m.connected {
		name := m.username
		if name == "" {
			name = "…"
		}
		b.WriteString(onlineDotStyle.Render("●") + " " + mutedStyle.Render("Connected as "+name))
	} else {
		b.WriteString(mutedStyle.Render("○ Disconnected"))
	}
	b.WriteString("\n\n")

	// --- CHATS section header with right-aligned count badge ---
	chatsHeader := sectionHeaderStyle.Render("CHATS")
	countBadge := badgeStyle.Render(fmt.Sprintf("%d", len(m.threads)))
	gap := width - lipgloss.Width(chatsHeader) - lipgloss.Width(countBadge)
	if gap < 1 {
		gap = 1
	}
	b.WriteString(chatsHeader + strings.Repeat(" ", gap) + countBadge)
	b.WriteString("\n")

	// --- Search bar (only while actively searching) ---
	if m.mode == ModeSearch {
		b.WriteString(searchBarStyle.Render("/ ") + m.searchInput.View())
		b.WriteString("\n")
	}
	b.WriteString("\n")

	// --- STATUS block built up front so we can reserve room for it ---
	statusBlock := m.renderStatusBlock(width)
	statusLines := strings.Count(statusBlock, "\n") + 1

	// --- Thread rows (with scroll window) ---
	threads := m.getVisibleThreads()
	headerLines := strings.Count(b.String(), "\n")
	avail := height - headerLines - statusLines - 1
	if avail < 1 {
		avail = 1
	}
	maxVisible := max(1, avail/3) // each row is ~3 lines (name + preview + gap)

	if len(threads) == 0 {
		// Preserve the nil-vs-empty distinction: nil = not loaded yet,
		// non-nil empty = loaded but zero matches/threads.
		if m.threads == nil {
			b.WriteString(placeholderStyle.Render("Loading threads..."))
		} else {
			b.WriteString(placeholderStyle.Render("No conversations"))
		}
		b.WriteString("\n")
	} else {
		offset := m.threadListOffset
		if offset > len(threads) {
			offset = 0
		}
		end := min(offset+maxVisible, len(threads))
		for vi, idx := range threads[offset:end] {
			i := offset + vi
			b.WriteString(m.renderThreadRow(width, m.threads[idx], i == m.cursor))
			b.WriteString("\n")
		}
		if offset > 0 {
			b.WriteString(mutedStyle.Render(fmt.Sprintf("  ↑ %d more", offset)) + "\n")
		}
		if rem := len(threads) - end; rem > 0 {
			b.WriteString(mutedStyle.Render(fmt.Sprintf("  ↓ %d more", rem)) + "\n")
		}
	}

	// --- Filler pushes the STATUS block to the bottom of the sidebar ---
	usedLines := strings.Count(b.String(), "\n")
	filler := height - usedLines - statusLines
	for i := 0; i < filler; i++ {
		b.WriteString("\n")
	}
	b.WriteString(statusBlock)

	return b.String()
}

// renderThreadRow renders one thread as a two-line block: a name + right-aligned
// timestamp line, and an italic preview line. The selected row gets a left
// accent bar and a tinted background; unselected rows get a matching indent.
func (m Model) renderThreadRow(width int, thread Thread, selected bool) string {
	inner := width - 1 // 1 col reserved for the accent bar / indent
	if inner < 8 {
		inner = 8
	}

	ts := formatTimestamp(threadTimestamp(thread))
	tsR := timestampStyle.Render(ts)
	tsW := lipgloss.Width(tsR)

	var badge string
	if thread.UnreadCount > 0 {
		badge = unreadBadgeStyle.Render(fmt.Sprintf(" %d", thread.UnreadCount))
	}

	nameMax := inner - tsW - lipgloss.Width(badge) - 1
	if nameMax < 4 {
		nameMax = 4
	}
	nameR := threadNameStyle.Render(truncate(getThreadDisplayName(thread), nameMax))

	gap := inner - lipgloss.Width(nameR) - lipgloss.Width(badge) - tsW
	if gap < 1 {
		gap = 1
	}
	topLine := nameR + badge + strings.Repeat(" ", gap) + tsR

	previewText := strings.ReplaceAll(thread.LastMessage.Text, "\n", " ")
	previewLine := previewStyle.Render(truncate(previewText, inner))

	block := lipgloss.JoinVertical(lipgloss.Left, topLine, previewLine)
	if selected {
		return selectedRowStyle.Width(inner).Render(block)
	}
	return unselectedRowStyle.Width(width).Render(block)
}

// renderStatusBlock renders the bottom-of-sidebar STATUS panel.
func (m Model) renderStatusBlock(width int) string {
	var b strings.Builder
	b.WriteString(mutedStyle.Render(strings.Repeat("─", max(1, width))))
	b.WriteString("\n")
	b.WriteString(sectionHeaderStyle.Render("STATUS"))
	b.WriteString("\n")

	// API line is driven by the real connection state.
	if m.connected {
		b.WriteString(statusOkStyle.Render("✓") + " " + mutedStyle.Render("API: Connected"))
	} else {
		b.WriteString(lipgloss.NewStyle().Foreground(colPink).Render("✗") + " " + mutedStyle.Render("API: Disconnected"))
	}
	b.WriteString("\n")

	// TODO: no real-time sync status field on the Model — decorative stub.
	b.WriteString(statusInfoStyle.Render("ℹ") + " " + mutedStyle.Render("Sync: Real-time"))
	b.WriteString("\n")

	// TODO: no "last check" timestamp is tracked anywhere — placeholder dash.
	b.WriteString(statusClockStyle.Render("◔") + " " + mutedStyle.Render("Last check: —"))

	return b.String()
}

func (m Model) renderConversation(width, height int) string {
	// No convo loaded — show placeholder.
	if m.activeThread == nil {
		return placeholderStyle.Render("Select a conversation and press Enter to open it")
	}

	var b strings.Builder

	// --- Header line 1: name + right-aligned @handle and kebab ---
	name := getThreadDisplayName(*m.activeThread)
	nameR := convNameStyle.Render(name)
	handleR := convHandleStyle.Render("@"+name) + " " + mutedStyle.Render("⋮")
	gap := width - lipgloss.Width(nameR) - lipgloss.Width(handleR)
	if gap < 1 {
		gap = 1
	}
	b.WriteString(nameR + strings.Repeat(" ", gap) + handleR)
	b.WriteString("\n")

	// --- Header line 2: presence ---
	// TODO: no presence / "active now" data exists on User or Thread — static stub.
	b.WriteString(mutedStyle.Render("Active now"))
	b.WriteString("\n")

	// --- Header line 3: accent rule (doubles as scroll indicator) ---
	if !m.messageViewport.AtBottom() {
		pct := int(m.messageViewport.ScrollPercent() * 100)
		ind := fmt.Sprintf("── %d%% ", pct)
		rest := width - lipgloss.Width(ind)
		if rest < 0 {
			rest = 0
		}
		b.WriteString(ruleStyle.Render(ind + strings.Repeat("─", rest)))
	} else {
		b.WriteString(ruleStyle.Render(strings.Repeat("─", max(1, width))))
	}
	b.WriteString("\n")

	// --- Scrollable messages ---
	b.WriteString(m.messageViewport.View())
	b.WriteString("\n")

	// --- Input box + Send ---
	b.WriteString(m.renderInputBar(width))

	return b.String()
}

// renderInputBar renders the rounded input box plus the decorative Send button.
// The whole row is exactly 3 lines tall (matching conversationInputHeight).
func (m Model) renderInputBar(width int) string {
	// Total row = inputBox(content+4 frame) + sendBtn(8 + 1 margin) = width.
	boxContent := width - 13
	if boxContent < 10 {
		boxContent = 10
	}

	var inner string
	if m.mode == ModeInsert {
		mi := m.messageInput // value copy: bounding Width here only affects this render
		mi.Width = boxContent
		inner = mi.View()
	} else {
		inner = placeholderStyle.Render(truncate("Type a message... (Enter to send)", boxContent))
	}

	inputBox := inputBoxStyle.Width(boxContent).Render(inner)
	sendBtn := sendButtonStyle.Render("Send")
	return lipgloss.JoinHorizontal(lipgloss.Top, inputBox, sendBtn)
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
			Foreground(colPurple).
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

	// Centered day divider.
	// TODO: static label — not derived from per-message dates (no day grouping).
	divider := dividerStyle.Render("── Today ──")
	b.WriteString(lipgloss.PlaceHorizontal(m.viewportWidth(), lipgloss.Center, divider))
	b.WriteString("\n\n")

	b.WriteString(m.renderMessages(m.activeMessages))

	return b.String()
}

// renderMessages renders a slice of messages as aligned, wrapped chat bubbles.
func (m Model) renderMessages(messages []Message) string {
	w := m.viewportWidth()
	maxBubble := max(16, w*3/4) // bubble caps at ~3/4 pane width
	contentW := maxBubble - 4   // minus rounded border (2) + padding (2)
	if contentW < 8 {
		contentW = 8
	}

	var b strings.Builder

	for _, msg := range messages {
		ts := formatTimestamp(msg.Timestamp)
		isMe := msg.UserId == m.userPK
		wrapped := wrapText(msg.Text, contentW)

		if isMe {
			// Right-aligned: my messages, accent bubble.
			bubble := sentBubbleStyle.Render(wrapped)
			// TODO: ✓✓ read receipt is decorative — Message has no read state.
			tsLine := timestampStyle.Render(ts + " ✓✓")
			block := lipgloss.JoinVertical(lipgloss.Right, bubble, tsLine)
			b.WriteString(lipgloss.PlaceHorizontal(w, lipgloss.Right, block))
			b.WriteString("\n\n")
		} else {
			// Left-aligned: their messages with a green sender label.
			sender := recvSenderStyle.Render("● " + getUsernameById(m.activeThread.Users, msg.UserId))
			bubble := recvBubbleStyle.Render(wrapped)
			tsLine := timestampStyle.Render(ts)
			block := lipgloss.JoinVertical(lipgloss.Left, sender, bubble, tsLine)
			b.WriteString(lipgloss.PlaceHorizontal(w, lipgloss.Left, block))
			b.WriteString("\n\n")
		}
	}

	return b.String()
}

// wrapText word-wraps s to at most `width` display columns per line, hard-
// breaking any single token longer than the width. Existing newlines are kept.
func wrapText(s string, width int) string {
	if width < 1 {
		width = 1
	}
	var out []string
	for _, para := range strings.Split(s, "\n") {
		words := strings.Fields(para)
		if len(words) == 0 {
			out = append(out, "")
			continue
		}
		cur := ""
		for _, wd := range words {
			// Hard-break tokens that don't fit on a line by themselves.
			for lipgloss.Width(wd) > width {
				if cur != "" {
					out = append(out, cur)
					cur = ""
				}
				runes := []rune(wd)
				take := runes
				for lipgloss.Width(string(take)) > width {
					take = take[:len(take)-1]
				}
				out = append(out, string(take))
				wd = string(runes[len(take):])
			}
			switch {
			case cur == "":
				cur = wd
			case lipgloss.Width(cur)+1+lipgloss.Width(wd) <= width:
				cur += " " + wd
			default:
				out = append(out, cur)
				cur = wd
			}
		}
		if cur != "" {
			out = append(out, cur)
		}
	}
	return strings.Join(out, "\n")
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

// threadTimestamp returns the best available time for a thread row: the last
// message time if set, otherwise the thread's last-activity time.
func threadTimestamp(t Thread) int64 {
	if t.LastMessage.Timestamp != 0 {
		return t.LastMessage.Timestamp
	}
	return t.LastActivityAt
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
