# Instagram CLI TUI - Development Roadmap

## Architecture Overview

```
┌─────────────────────────────────────┐
│   Go TUI (bubbletea)                │
│   - Renders UI                      │
│   - Handles user input              │
│   - Manages app state               │
└──────────────┬──────────────────────┘
               │ IPC (stdin/stdout or WebSocket)
┌──────────────▼──────────────────────┐
│   TypeScript Backend Service        │
│   - instagram-private-api           │
│   - Authentication                  │
│   - Message sending/receiving       │
│   - Real-time MQTT updates          │
└─────────────────────────────────────┘
```

---

## Phase 1: Backend Service Setup

**Goal:** Get a TypeScript service that can handle Instagram operations via JSON commands

### Project Structure
```
instagram-cli/
├── backend/          # TypeScript service
│   ├── src/
│   │   ├── server.ts      # Main IPC server
│   │   ├── instagram.ts   # Instagram API wrapper
│   │   └── types.ts       # Shared types
│   ├── package.json
│   └── tsconfig.json
└── tui/              # Go TUI
    ├── main.go
    ├── models.go
    ├── commands.go
    └── views.go
```

### Backend Responsibilities
1. Authenticate with Instagram
2. Fetch thread list
3. Fetch messages for a thread
4. Send messages
5. Listen for real-time updates (new messages)
6. Emit events to frontend

### Tasks
- [ ] Create minimal TypeScript server that reads/writes JSON to stdio
- [ ] Implement login + session persistence
- [ ] Implement `getThreads` command
- [ ] Test with curl/manual JSON input

**Timeline:** Week 1

---

## Phase 2: Go TUI Setup

**Goal:** Create basic TUI that can communicate with backend

### TUI Design - Three Main Views

#### 1. Thread List View (Primary)
```
┌─────────────────────────────────────┐
│ Instagram CLI                    [i]│
├─────────────────────────────────────┤
│ ▶ @friend1          Hey, you up?   │
│   @group_chat       Photo           │
│   @friend2          Thanks!     [2] │
│   @coworker         Let's sync      │
├─────────────────────────────────────┤
│ j/k: navigate  Enter: open  q: quit│
└─────────────────────────────────────┘
```

#### 2. Conversation View
```
┌─────────────────────────────────────┐
│ ← @friend1                       [i]│
├─────────────────────────────────────┤
│ friend1: Hey, you up?               │
│          10:23 PM                   │
│                                     │
│                        Yeah what's  │
│                        up?          │
│                        10:24 PM     │
│                                     │
│ friend1: Want to grab coffee?       │
│          10:25 PM                   │
├─────────────────────────────────────┤
│ > _                                 │
│ Esc: back  Enter: send              │
└─────────────────────────────────────┘
```

#### 3. Info/Status View
```
┌─────────────────────────────────────┐
│ Status: Connected ✓                 │
│ User: @your_username                │
│ Threads: 42 | Unread: 3             │
└─────────────────────────────────────┘
```

### Tasks
- [ ] Create Go bubbletea app that spawns backend process
- [ ] Render static thread list
- [ ] Handle keyboard navigation (j/k, enter, q)
- [ ] Send `getThreads` command and parse response

**Timeline:** Week 2

---

## Phase 3: Communication Protocol

### JSON-RPC Style Over Stdio

**Frontend → Backend (Request):**
```json
{
  "id": 1,
  "method": "getThreads",
  "params": {}
}
```

**Backend → Frontend (Response):**
```json
{
  "id": 1,
  "result": [
    {
      "threadId": "123",
      "users": ["user1"],
      "lastMessage": "Hey",
      "timestamp": 1234567890,
      "unreadCount": 2
    }
  ]
}
```

**Backend → Frontend (Events):**
```json
{
  "event": "newMessage",
  "data": {
    "threadId": "123",
    "message": {...}
  }
}
```

### Methods to Implement
- `login` - Authenticate user
- `getThreads` - Fetch conversation list
- `getMessages` - Fetch messages for a thread
- `sendMessage` - Send a message to a thread
- `markRead` - Mark thread as read

### Events to Handle
- `newMessage` - New message received
- `typing` - User is typing
- `messageRead` - Message was read

---

## Phase 4: Conversations & Navigation

**Goal:** Display and navigate conversations

### Tasks
- [ ] Add `getMessages` to backend
- [ ] Build conversation view in TUI
- [ ] Navigate between views (Esc to go back)
- [ ] Display message history with scrolling
- [ ] Implement viewport for long conversations

**Timeline:** Week 3

---

## Phase 5: Sending & Real-time Updates

**Goal:** Enable sending messages and receive real-time updates

### Tasks
- [ ] Add `sendMessage` to backend
- [ ] Add text input to conversation view
- [ ] Implement MQTT listener in backend
- [ ] Handle `newMessage` events in TUI
- [ ] Update UI when new messages arrive
- [ ] Show typing indicators

**Timeline:** Week 4

---

## Key Design Decisions

### State Management
- Keep all Instagram state in backend
- TUI only caches what's visible (current thread list, current conversation)
- Request data on-demand when navigating

### Error Handling
- Backend sends error responses with error codes
- TUI shows errors in status bar (non-blocking)
- Critical errors (auth failure) show modal

### Performance
- Lazy load messages (initial 20, load more on scroll)
- Debounce typing for typing indicators
- Cache thread list, refresh every N seconds

---

## Future Enhancements (Post-MVP)

### Features to Add Later
- [ ] Search conversations
- [ ] Media support (images, videos)
- [ ] Group chat management
- [ ] Message reactions
- [ ] Delete/unsend messages
- [ ] Archive threads
- [ ] Notifications
- [ ] Multiple accounts

### Optimizations
- [ ] Message pagination
- [ ] Thread list virtualization
- [ ] Offline message queue
- [ ] Session management improvements

---

## Testing Strategy

### Backend Testing
- Unit tests for Instagram API wrapper
- Integration tests for message flow
- Manual testing with test Instagram account

### Frontend Testing
- Manual testing of UI flows
- Keyboard navigation testing
- Edge cases (long messages, special characters)

### End-to-End Testing
- Full message send/receive flow
- Real-time update handling
- Error recovery scenarios

---

## Notes

- Use test Instagram account for development
- Store credentials in `.env` file (never commit)
- Document Instagram API rate limits
- Keep capture files from mitmproxy for reference
- Consider adding CLI fallback mode for automation
