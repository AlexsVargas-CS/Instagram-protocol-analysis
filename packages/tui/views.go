package main

//Views is our "render fucntion that converts into str "
import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/lipgloss"
)

//header bar style
var headerStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("15")). // white
	Background(lipgloss.Color("62")). // purple-ish
	Padding(0, 1)
//Thread list

var selectedThreadStyle = lipgloss.NewStyle().
	Bold(true).
	Foreground(lipgloss.Color("15")).
	Background(lipgloss.Color("60"))
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

//convo message style
var messageStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("252")) 

var timestampStyle = lipgloss.NewStyle().
	Foreground(lipgloss.Color("240")) 
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



func (m Model) View() string {

	if m.height == 0 || m.width == 0 {
		return "not yet rendered"
	}  


	//load header and stat bar 

	header := m.renderHeader() // we will make 4 render functions later on 
	statusBar := m.renderStatusBar()


	bodyHeight := m.height - 2  // total height - header and statusBar

	if bodyHeight < 1 {
		bodyHeight = 1
	}

	leftWidth := m.width/3
	rightWidth := m.width - leftWidth -1

 //render the panels 
 //the left panel will render the threadList 
 // The right will render the convo
	leftPanel := m.renderThreadList(leftWidth, bodyHeight)
	rightPanel := m.renderConversation(rightWidth, bodyHeight)


	left := leftPanelBaseStyle.
		Width(leftWidth).
		Height(bodyHeight).
		Render(leftPanel)

	right := rightPanelBaseStyle.
		Width(rightWidth).
		Height(bodyHeight).
		Render(rightPanel)


//after we need to join them
body := lipgloss.JoinHorizontal(lipgloss.Top, left, right)

return lipgloss.JoinVertical(lipgloss.Left ,header,body, statusBar)


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

	// Search bar: show input when in search mode, otherwise show hint
	if m.mode == ModeSearch {
		b.WriteString(searchBarStyle.Render("🔍 "))
		b.WriteString(m.searchInput.View())
	} else {
		b.WriteString(placeholderStyle.Render("🔍 Press s to search"))
	}
	b.WriteString("\n\n")

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

	// Render each thread entry
	for i, idx := range threads {
		thread := m.threads[idx]

		var indicator string
		if i == m.cursor {
			indicator = "→ "
		} else {
			indicator = "▷ "
		}

		// Build display name from first user (or "Group" for group chats)
		displayName := getThreadDisplayName(thread)

		
		maxNameWidth := width - 8
		if maxNameWidth < 4 {
			maxNameWidth = 4
		}
		if lipgloss.Width(displayName) > maxNameWidth {
			displayName = displayName[:maxNameWidth-1] + "…"
		}

		// Unread badge
		var badge string
		if thread.UnreadCount > 0 {
			badge = unreadBadgeStyle.Render(fmt.Sprintf(" [%d]", thread.UnreadCount))
		}

		// Compose the line
		var line string
		if i == m.cursor {
			line = selectedThreadStyle.Render(indicator+displayName) + badge
		} else {
			line = unselectedThreadStyle.Render(indicator+displayName) + badge
		}

		b.WriteString(line)

		// Preview of last message, dimmed, on the next line
		preview := truncate(thread.LastMessage.Text, width-4)
		if preview != "" {
			b.WriteString("\n")
			b.WriteString("  " + placeholderStyle.Render(preview))
		}

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

	// Conversation header — who you're talking to
	displayName := getThreadDisplayName(*m.activeThread)
	header := lipgloss.NewStyle().
			Bold(true).
			Foreground(lipgloss.Color("15")).
			Render("@" + displayName)
		b.WriteString(header)
		b.WriteString("\n")
		b.WriteString(strings.Repeat("─", width))
		b.WriteString("\n")

	// Messages
	if len(m.activeMessages) == 0 {
		b.WriteString(placeholderStyle.Render("No messages yet"))
	} else {
		for _, msg := range m.activeMessages {
			// Message text
			b.WriteString(messageStyle.Render(msg.Text))
			b.WriteString("\n")

			// Timestamp — convert unix timestamp to readable format
			ts := formatTimestamp(msg.Timestamp)
			b.WriteString("  " + timestampStyle.Render(ts))
			b.WriteString("\n\n")
		}
	}

	
	b.WriteString("\n")
	if m.mode == ModeInsert {
		b.WriteString("> " + m.messageInput.View())
	} else {
		b.WriteString(placeholderStyle.Render("> Press i to type a message"))
	}

	return b.String()
}

func (m Model) renderStatusBar() string {
	var keys string
	switch m.mode {
	case ModeNormal:
		keys = "j/k: nav  Enter: load  s: search  i: insert  q: quit"
	case ModeSearch:
		keys = "Type to filter  Enter: select  Esc: cancel"
	case ModeInsert:
		keys = "Type message  Enter: send  Esc: cancel"
	}

	// Mode badge on the right
	modeBadge := modeStyle.Render(m.mode.String())

	// Spacing between keys and mode badge
	spacerWidth := m.width - lipgloss.Width(keys) - lipgloss.Width(modeBadge) - 2
	if spacerWidth < 1 {
		spacerWidth = 1
	}
	spacer := strings.Repeat(" ", spacerWidth)

	return statusBarStyle.
		Width(m.width).
		Render(keys + spacer + modeBadge)
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

// truncate shortens a string to maxLen characters, adding "…" if truncated.
func truncate(s string, maxLen int) string {
	if maxLen < 4 {
		maxLen = 4
	}
	if lipgloss.Width(s) <= maxLen {
		return s
	}
	if len(s) > maxLen-1 {
		return s[:maxLen-1] + "…"
	}
	return s
}