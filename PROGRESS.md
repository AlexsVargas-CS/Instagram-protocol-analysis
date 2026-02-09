# Instagram CLI TUI - Development Progress

**Last Updated:** 2026-02-09
**Current Phase:** Phase 1 - Backend Service Setup
**Current Step:** Step 3 - server.ts (ready to start)

---

## Project Overview

Building an Instagram CLI TUI to reduce doomscrolling while maintaining messaging capabilities. The project uses a hybrid architecture:
- **Backend:** TypeScript service using `instagram-private-api` for Instagram protocol handling
- **Frontend:** Go TUI using `bubbletea` for user interface
- **Communication:** JSON-RPC over stdin/stdout (IPC)

**Educational Goal:** Learn cybersecurity concepts through reverse engineering and API analysis

---

## Current Status

### ✅ Completed Tasks

#### Initial Setup (Session 1 - 2026-02-04)
- [x] Decided on Go + bubbletea for TUI (over Rust + ratatui)
- [x] Installed dependencies:
  - Backend: `instagram-private-api`, `instagram_mqtt`, `dotenv`, TypeScript dev tools
  - Frontend: `bubbletea`, `bubbles`, `lipgloss`
- [x] Created project structure:
  ```
  instagram-cli/
  ├── packages/
  │   ├── backend/    # TypeScript service
  │   └── tui/        # Go TUI
  └── docs/
  ```
- [x] Created development roadmap (`instagram-cli-development-roadmap_1.md`)
- [x] Created backend implementation guide (`BACKEND-IMPLEMENTATION.md`)
- [x] Set up TypeScript configuration (`tsconfig.json`)
- [x] Set up package.json with scripts (dev, build, start)

#### Step 1: types.ts (Session 2 - 2026-02-05)
- [x] Designed minimal TypeScript interfaces for Phase 1
- [x] Created types for: User, Message, Thread
- [x] Made architectural decision: Use simplified app-specific types with transformation layer
  - **Why:** Better maintainability, easier testing, decoupled from library changes
  - **Trade-off:** Need to write mapping functions vs. using library types directly
- [x] Explored `instagram-private-api` library structure
- [x] Located key interfaces in `direct-inbox.feed.response.ts`:
  - `DirectInboxFeedResponseThreadsItem` (for threads)
  - `DirectInboxFeedResponseUsersItem` (for users)
  - Fields identified: thread_id, users, last_permanent_item, is_group, last_activity_at

#### Step 2: instagram.ts (Sessions 3-4, 2026-02-08 to 2026-02-09)
- [x] Create `InstagramClient` class
- [x] Implement `login()` with username/password
- [x] Implement `saveSession()` to persist auth state
- [x] Implement `loadSession()` to restore auth state
- [x] Implement `getThreads()` to fetch conversation list
- [x] Map Instagram API responses to defined types (mapUser, mapThread, mapMessage)
- [x] Export the client class
- [x] Handle API errors gracefully (custom error hierarchy + try/catch on all methods)

### 🔄 In Progress

#### Step 3: server.ts
- [ ] Set up readline to read from stdin
- [ ] Parse incoming JSON and validate structure
- [ ] Route methods to InstagramClient
- [ ] Send JSON responses to stdout
- [ ] Handle parse errors
- [ ] Handle unknown methods
- [ ] Handle Instagram API errors
- [ ] Attempt session restoration on startup

**Next Immediate Action:** Start Step 3 — build the stdin JSON-RPC server (server.ts)

### 📋 Pending Tasks

#### Future Phases
- Phase 2: Go TUI Setup (Week 2)
- Phase 3: Communication Protocol (Week 2-3)
- Phase 4: Conversations & Navigation (Week 3)
- Phase 5: Sending & Real-time Updates (Week 4)

---

## Key Decisions Made

### Architecture Decisions
1. **Hybrid TypeScript/Go approach** (vs. pure Go or pure TypeScript)
   - Rationale: Leverage existing protocol research while gaining TUI performance
   - Allows gradual migration if needed

2. **JSON-RPC over stdin/stdout** (vs. REST API or WebSocket)
   - Rationale: Simpler IPC, no port conflicts, easier debugging
   - Trade-off: Less flexible than REST, but sufficient for our use case

3. **Custom types with transformation layer** (vs. using library types directly)
   - Rationale: Maintainability, testability, decoupling
   - Trade-off: More initial code, but better long-term

4. **Custom error class hierarchy** (vs. generic Error or library errors)
   - Rationale: Structured error handling lets server.ts map errors to JSON-RPC error codes cleanly
   - Base `InstagramClientError` → `AuthenticationError` (with reason codes), `SessionError`, `InstagramAPIError` (with optional statusCode)

5. **MQTT for real-time messaging** (vs. REST polling)
   - Rationale: Less detectable, mimics real Instagram app behavior
   - Already proven in research phase

### Technology Choices
- **Go + bubbletea** for TUI (not Rust + ratatui)
  - Reason: Easier learning curve, better networking libraries for reverse engineering
- **instagram-private-api** library (not building from scratch)
  - Reason: Proven implementation, focus on learning vs. reinventing
- **Android 11 emulator** for testing (not Android 14+)
  - Reason: Easier certificate installation, no APEX module restrictions

---

## Known Issues & Blockers

### Current Blockers
- None at the moment

### Known Limitations
1. **Instagram anti-fraud detection**
   - Test account was suspended during research phase
   - Solution: Use test accounts only, MQTT is less detectable than REST
   
2. **Session persistence complexity**
   - Instagram sessions can expire
   - Need to handle re-authentication gracefully

3. **Library deprecation warnings**
   - `instagram-private-api` has some deprecation warnings
   - Acceptable for personal/research project

---

## Learning Outcomes

### Technical Skills Gained
1. **TypeScript Type System**
   - Understanding compile-time type requirements
   - Interface design and separation of concerns
   - Difference between library types and application types

2. **Instagram Protocol Understanding**
   - API endpoints (e.g., `/api/v1/direct_v2/threads/broadcast/text/`)
   - Authentication flows and session management
   - Device identifiers and headers
   - MQTT vs REST detection profiles

3. **Reverse Engineering Methodology**
   - Traffic interception setup (mitmproxy + Android emulator)
   - Certificate pinning bypass techniques
   - API response analysis

### Architectural Insights
1. **IPC vs REST Communication**
   - When to use each pattern
   - Stdin/stdout advantages for subprocess communication

2. **Type System Design**
   - Build order matters: types → business logic → IPC layer
   - Why TypeScript needs types at compile time

---

## Session Log

### Session 4: 2026-02-09 (Error Handling & Custom Error Class Hierarchy)
**Focus:** Adding structured error handling to InstagramClient with a custom error class hierarchy

**Accomplishments:**
- Created custom error class hierarchy in types.ts: `InstagramClientError` (base) extending `Error`, with `AuthenticationError`, `SessionError`, and `InstagramAPIError` as subclasses
- Added error handling to `login()` — catches `IgLoginBadPasswordError`, `IgCheckpointError`, `IgLoginTwoFactorRequiredError`
- Added error handling to `getMessages()` — catches `IgLoginRequiredError` for expired sessions
- Added error handling to `getThreads()` — catches `IgLoginRequiredError` for expired sessions
- Iterative code review catching bugs: `AuthenticationError` extending wrong class, `=` vs `:` for type annotation, typo in class name string

**Decisions Made:**
- Error class hierarchy design: base `InstagramClientError` with `AuthenticationError` (with reason codes), `SessionError`, and `InstagramAPIError` (with optional statusCode) as subclasses

**Next Session Goals:**
- Start Step 3: server.ts (stdin readline, JSON-RPC parsing, method routing)

### Session 3: 2026-02-08 (InstagramClient Implementation & Mapper Functions)
**Focus:** Implementing the InstagramClient class methods and mapper functions with iterative code review

**Accomplishments:**
- Implemented mapper functions: mapUser, mapThread, mapMessage
- Implemented `getThreads()` using directInbox feed
- Implemented `getMessages()` using directThread feed
- Added `sendMessage()` placeholder (Phase 5)
- Iterative code review fixing syntax errors, type mismatches, and logic bugs
- Fixed types.ts: `thread_Id` → `thread_id`, corrected `lastMessage` field type
- Cleaned up dead code (removed unused for loop in getThreads)

**Next Session Goals:**
- Add error handling to InstagramClient methods
- Start Step 3: server.ts (stdin JSON-RPC server, method routing)

### Session 2: 2026-02-05 (Backend Development Kickoff)
**Focus:** Understanding backend structure and creating types.ts

**Accomplishments:**
- Reviewed last session's progress
- Understood the file dependency chain (types → instagram → server)
- Designed minimal interfaces for Phase 1
- Made decision on type strategy (custom types + mapping layer)
- Created this PROGRESS.md file

**Questions Answered:**
- Why build types.ts first? (Compile-time requirements)
- Why not use library types directly? (Maintainability, testing, decoupling)
- How to explore library documentation? (GitHub repo, npm docs, TypeScript definitions)

**Next Session Goals:**
- Implement `InstagramClient` class skeleton
- Write `login()` method
- Write session persistence (save/load)
- Test login flow manually

### Session 1: 2026-02-04 (Project Setup & Planning)
**Focus:** Architecture design and dependency installation

**Accomplishments:**
- Decided on Go + bubbletea for TUI frontend
- Installed all required dependencies
- Created comprehensive development roadmap
- Set up project structure
- Configured TypeScript and Go modules

**Decisions Made:**
- Hybrid approach (TypeScript backend + Go frontend)
- IPC communication via JSON-RPC over stdin/stdout
- Use existing libraries (`instagram-private-api`, `instagram_mqtt`)

**Next Session Goals:**
- Start backend implementation (Phase 1)
- Create types.ts
- Understand library structure

---

## Environment Setup

### Backend Dependencies
```json
{
  "dependencies": {
    "dotenv": "^17.2.3",
    "instagram_mqtt": "^1.2.3",
    "instagram-private-api": "^1.46.1",
    "re2": "^1.23.2"
  },
  "devDependencies": {
    "@types/node": "^25.2.0",
    "nodemon": "^3.1.11",
    "ts-node": "^10.9.2",
    "typescript": "^5.9.3"
  }
}
```

### Frontend Dependencies
```go
require (
    github.com/charmbracelet/bubbles v0.21.1
    github.com/charmbracelet/bubbletea v1.3.10
    github.com/charmbracelet/lipgloss v1.1.0
)
```

### Test Environment
- **Emulator:** Android Studio (Pixel Pro 5, API 30, Android 11)
- **Proxy:** mitmproxy for traffic analysis
- **Instagram APK:** Pre-patched SSL pinning bypass version
- **Test Account:** Separate from primary account (already suspended during research)

---

## What NOT to Try (Already Attempted/Rejected)

### ❌ Don't Try These Approaches
1. **Using library types directly in application code**
   - Reason: Creates tight coupling, harder to test
   - Better: Use transformation layer with custom types

2. **Building Instagram protocol from scratch**
   - Reason: Time-consuming, error-prone
   - Better: Use proven libraries while studying implementation

3. **REST API exclusively for messaging**
   - Reason: More detectable than MQTT
   - Better: Use MQTT for real-time updates

4. **Android 14+ emulator for testing**
   - Reason: Certificate installation too complex
   - Better: Use Android 11 for easier research setup

5. **Using primary Instagram account for testing**
   - Reason: Risk of permanent suspension
   - Better: Always use test accounts

---

## Quick Start Commands

### Backend Development
```bash
cd packages/backend

# Run in development mode
npm run dev

# Build for production
npm run build

# Run production build
npm start

# Manual testing
echo '{"id":1,"method":"getThreads","params":{}}' | npm run dev
```

### Frontend Development
```bash
cd packages/tui

# Run TUI
go run .

# Build binary
go build -o instagram-cli
```

---

## References

### Documentation
- [Instagram Private API GitHub](https://github.com/dilame/instagram-private-api)
- [Instagram MQTT GitHub](https://github.com/valga/instagram_mqtt)
- [Bubbletea Tutorial](https://github.com/charmbracelet/bubbletea/tree/master/tutorials)

### Research Files
- `instagram_capture.flow` - mitmproxy capture of Instagram traffic
- `instagram-cli-development-roadmap_1.md` - Full project roadmap
- `BACKEND-IMPLEMENTATION.md` - Backend implementation details

### External Resources
- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [Instagram API Analysis Notes](in project memory)

---

## Notes for Future Sessions

### For Claude Code / CLI Sessions
When starting a new session:
1. Read this PROGRESS.md first to understand current state
2. Check "Current Phase" and "Current Step" sections
3. Review "What NOT to Try" to avoid wasting time
4. Check "Known Issues & Blockers" for context
5. Update this file after making progress

### Update Frequency
- Update after each significant accomplishment
- Add session log entry at end of each coding session
- Update "Current Step" when moving to new task
- Mark tasks as complete with ✅ when finished

### Maintenance
- Keep "Current Status" section up-to-date
- Archive old session logs if file gets too large (keep last ~10 sessions)
- Update "Last Updated" date at top of file
