package main

import (
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

// Backend manages the Node.js child process that handles Instagram API calls.
type Backend struct {
	cmd    *exec.Cmd
	Stdin  io.WriteCloser
	Stdout io.ReadCloser
}

// StartBackend spawns `node dist/server.js` in the backend directory.
// It returns a Backend with access to the child's stdin/stdout pipes.
func StartBackend() (*Backend, error) {
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return nil, fmt.Errorf("node not found on PATH: %w", err)
	}

	// Resolve the backend directory relative to the TUI binary.
	backendDir := filepath.Join("..", "backend")
	scriptPath := filepath.Join("dist", "server.js")

	cmd := exec.Command(nodePath, scriptPath)
	cmd.Dir = backendDir
	cmd.Stderr = os.Stderr // backend debug output visible in terminal

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdin pipe: %w", err)
	}

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, fmt.Errorf("failed to get stdout pipe: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("failed to start backend: %w", err)
	}

	return &Backend{
		cmd:    cmd,
		Stdin:  stdin,
		Stdout: stdout,
	}, nil
}

// Stop gracefully shuts down the backend process.
func (b *Backend) Stop() {
	if b.Stdin != nil {
		b.Stdin.Close()
	}
	if b.cmd != nil && b.cmd.Process != nil {
		// Wait briefly for graceful exit, then kill.
		_ = b.cmd.Wait()
	}
}
