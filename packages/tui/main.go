package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	m := InitialModel()

	// Connect to the always-on daemon over WebSocket.
	cfg, err := LoadDaemonConfig()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Config error: %v\n", err)
		os.Exit(1)
	}
	rpc, err := DialDaemon(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to connect to daemon: %v\n", err)
		os.Exit(1)
	}
	defer rpc.Close()

	m.rpc = rpc
	m.statusMsg = "Connecting..."
	m.conversationCache = make(map[string][]Message)
	m.cursorCache = make(map[string]string)
	m.hasOlderCache = make(map[string]bool)

	p := tea.NewProgram(m, tea.WithAltScreen())

	if _, err := p.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "Error running program: %v\n", err)
		os.Exit(1)
	}
}
