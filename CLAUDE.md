# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Instagram CLI TUI application for learning cybersecurity through reverse engineering and API analysis. Hybrid TypeScript/Go monorepo architecture.

## Build & Development Commands

### Backend (TypeScript - packages/backend/)
```bash
cd packages/backend
npm install              # Install dependencies
npm run dev              # Run with ts-node + nodemon (hot reload)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled JavaScript
```

### TUI (Go - packages/tui/)
```bash
cd packages/tui
go build                 # Build binary
go run .                 # Run directly
```

### Root Level
```bash
npm install              # Install all workspace dependencies
npx prettier --write .   # Format all files
```

## Architecture

### Monorepo Structure
- **packages/backend/** - TypeScript service using instagram-private-api for Instagram protocol
- **packages/tui/** - Go terminal UI using Charmbracelet (bubbletea/bubbles/lipgloss)

### Communication: JSON-RPC over stdin/stdout
The Go TUI spawns the TypeScript backend as a child process. They communicate via JSON-RPC:

**Request:** `{ "id": 1, "method": "getThreads", "params": {} }`
**Response:** `{ "id": 1, "result": [...], "error": null }`
**Events:** `{ "event": "newMessage", "data": {...} }`

### Backend Implementation Order (dependency chain)
```
types.ts → instagram.ts → server.ts
```

- **types.ts** - Request/Response/Event interfaces, User/Thread/Message types
- **instagram.ts** - InstagramClient class wrapping instagram-private-api
- **server.ts** - IPC server reading stdin, routing methods, emitting events

### Key Dependencies
- **instagram-private-api** (v1.46.1) - Reverse-engineered Instagram API
- **instagram_mqtt** (v1.2.3) - Real-time messaging via MQTT
- **bubbletea** (v1.3.10) - Elm-inspired Go TUI framework

## Code Style

Prettier configured: 2-space indent, single quotes, 100 char width, trailing commas, LF endings. TypeScript uses strict mode with ES2020 target.

## Current Status

Phase 1: Backend Service Setup. See PROGRESS.md for session-by-session tracking and BACKEND-IMPLEMENTATION.md for detailed implementation patterns.
