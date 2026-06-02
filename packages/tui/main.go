package main

import (
	"fmt"
	"os"

	tea "github.com/charmbracelet/bubbletea"
)

func main() {
	m := InitialModel()

	// Spawn the TypeScript backend as a child process.
	backend, err := StartBackend()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Failed to start backend: %v\n", err)
		os.Exit(1)
	}
	defer backend.Stop()

	m.backend = backend
	m.rpc = NewRPCClient(backend.Stdin, backend.Stdout)
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
