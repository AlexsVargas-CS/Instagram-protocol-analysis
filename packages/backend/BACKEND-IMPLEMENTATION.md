# Backend Implementation Guide

This document outlines the implementation plan for the TypeScript backend service that handles Instagram operations via JSON commands over stdio.

---

## Overview

The backend serves as the bridge between the Go TUI and Instagram's API. It:
- Receives JSON-RPC style commands from stdin
- Executes Instagram operations using `instagram-private-api`
- Returns JSON responses to stdout
- Emits real-time events for new messages

---

## Implementation Order

```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│  types.ts   │ --> │  instagram.ts   │ --> │  server.ts  │
│  (Step 1)   │     │    (Step 2)     │     │  (Step 3)   │
└─────────────┘     └─────────────────┘     └─────────────┘
   Contracts          Business Logic         IPC Layer
```

### Why This Order?

1. **types.ts first** - Defines all interfaces and types. Both `instagram.ts` and `server.ts` import from here. You can't build the other files without knowing the shape of your data.

2. **instagram.ts second** - Contains the actual Instagram logic. It needs types but doesn't need the server. You can unit test this file in isolation.

3. **server.ts last** - Glues everything together. It imports types and calls instagram functions. Building this last means all dependencies are ready.

---

## Step 1: types.ts

### Purpose
Define all TypeScript interfaces and types used across the backend.

### What to Implement

```typescript
// JSON-RPC Request/Response
interface Request {
  id: number;
  method: string;
  params: Record<string, unknown>;
}

interface Response {
  id: number;
  result?: unknown;
  error?: ErrorPayload;
}

interface ErrorPayload {
  code: number;
  message: string;
}

// Events (backend -> frontend, no request id)
interface Event {
  event: string;
  data: unknown;
}

// Instagram Data Types
interface Thread {
  threadId: string;
  users: User[];
  lastMessage: string;
  timestamp: number;
  unreadCount: number;
  isGroup: boolean;
}

interface User {
  pk: string;
  username: string;
  fullName: string;
  profilePicUrl: string;
}

interface Message {
  itemId: string;
  userId: string;
  text: string;
  timestamp: number;
  itemType: 'text' | 'media' | 'link' | 'other';
}

// Method Parameters
interface LoginParams {
  username: string;
  password: string;
}

interface GetMessagesParams {
  threadId: string;
  cursor?: string;
}

interface SendMessageParams {
  threadId: string;
  text: string;
}
```

### Checklist
- [ ] Define `Request` and `Response` interfaces for JSON-RPC
- [ ] Define `ErrorPayload` with error codes
- [ ] Define `Event` interface for real-time updates
- [ ] Define `Thread` interface
- [ ] Define `User` interface
- [ ] Define `Message` interface
- [ ] Define parameter interfaces for each method
- [ ] Export all types

---

## Step 2: instagram.ts

### Purpose
Wrap `instagram-private-api` with clean methods that return typed data.

### What to Implement

```typescript
import { IgApiClient } from 'instagram-private-api';
import { Thread, User, Message, LoginParams } from './types';

class InstagramClient {
  private ig: IgApiClient;
  private sessionPath: string;

  constructor() {
    this.ig = new IgApiClient();
    this.sessionPath = './session.json';
  }

  // Authentication
  async login(params: LoginParams): Promise<User>;
  async loadSession(): Promise<boolean>;
  private saveSession(): Promise<void>;

  // Thread Operations
  async getThreads(): Promise<Thread[]>;
  async getMessages(threadId: string, cursor?: string): Promise<Message[]>;

  // Messaging
  async sendMessage(threadId: string, text: string): Promise<Message>;
  async markAsRead(threadId: string): Promise<void>;
}
```

### Session Persistence

The Instagram API requires authentication. To avoid logging in every time:

1. After successful login, serialize the session state to `session.json`
2. On startup, check if `session.json` exists
3. If it does, load and validate the session
4. If invalid or missing, require fresh login

```typescript
// Save session after login
private async saveSession(): Promise<void> {
  const session = await this.ig.state.serialize();
  delete session.constants; // Remove non-serializable data
  await fs.writeFile(this.sessionPath, JSON.stringify(session));
}

// Load session on startup
async loadSession(): Promise<boolean> {
  try {
    const data = await fs.readFile(this.sessionPath, 'utf-8');
    await this.ig.state.deserialize(JSON.parse(data));
    // Validate by making a simple request
    await this.ig.account.currentUser();
    return true;
  } catch {
    return false;
  }
}
```

### Checklist
- [ ] Create `InstagramClient` class
- [ ] Implement `login()` with username/password
- [ ] Implement `saveSession()` to persist auth state
- [ ] Implement `loadSession()` to restore auth state
- [ ] Implement `getThreads()` to fetch conversation list
- [ ] Map Instagram API responses to your defined types
- [ ] Handle API errors gracefully
- [ ] Export the client class or singleton instance

---

## Step 3: server.ts

### Purpose
Create the IPC layer that reads JSON from stdin, routes to instagram.ts, and writes JSON to stdout.

### What to Implement

```typescript
import * as readline from 'readline';
import { InstagramClient } from './instagram';
import { Request, Response, ErrorPayload } from './types';

const client = new InstagramClient();

// Read JSON lines from stdin
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on('line', async (line: string) => {
  let request: Request;

  try {
    request = JSON.parse(line);
  } catch {
    sendError(0, -32700, 'Parse error');
    return;
  }

  await handleRequest(request);
});

async function handleRequest(req: Request): Promise<void> {
  try {
    let result: unknown;

    switch (req.method) {
      case 'login':
        result = await client.login(req.params);
        break;
      case 'getThreads':
        result = await client.getThreads();
        break;
      case 'getMessages':
        result = await client.getMessages(req.params.threadId, req.params.cursor);
        break;
      case 'sendMessage':
        result = await client.sendMessage(req.params.threadId, req.params.text);
        break;
      default:
        sendError(req.id, -32601, `Method not found: ${req.method}`);
        return;
    }

    sendResponse(req.id, result);
  } catch (error) {
    sendError(req.id, -32000, error.message);
  }
}

function sendResponse(id: number, result: unknown): void {
  const response: Response = { id, result };
  console.log(JSON.stringify(response));
}

function sendError(id: number, code: number, message: string): void {
  const response: Response = {
    id,
    error: { code, message }
  };
  console.log(JSON.stringify(response));
}

// Attempt to restore session on startup
async function init(): Promise<void> {
  const restored = await client.loadSession();
  if (restored) {
    sendEvent('sessionRestored', { success: true });
  }
}

function sendEvent(event: string, data: unknown): void {
  console.log(JSON.stringify({ event, data }));
}

init();
```

### Error Codes

Follow JSON-RPC 2.0 conventions:

| Code | Meaning |
|------|---------|
| -32700 | Parse error (invalid JSON) |
| -32600 | Invalid request |
| -32601 | Method not found |
| -32602 | Invalid params |
| -32000 | Server error (Instagram API error) |
| -32001 | Authentication required |
| -32002 | Rate limited |

### Checklist
- [ ] Set up readline to read from stdin
- [ ] Parse incoming JSON and validate structure
- [ ] Route methods to InstagramClient
- [ ] Send JSON responses to stdout
- [ ] Handle parse errors
- [ ] Handle unknown methods
- [ ] Handle Instagram API errors
- [ ] Attempt session restoration on startup
- [ ] Add `sendEvent()` for real-time updates (Phase 5)

---

## Testing

### Manual Testing with Echo

Once implemented, test with:

```bash
# Start the server
npm run dev

# In another terminal, send commands
echo '{"id":1,"method":"getThreads","params":{}}' | npm run dev
```

### Test Sequence

1. **Test session load (should fail first time)**
   ```json
   // Server starts, emits event if session exists
   {"event":"sessionRestored","data":{"success":false}}
   ```

2. **Test login**
   ```json
   {"id":1,"method":"login","params":{"username":"your_user","password":"your_pass"}}
   ```
   Expected response:
   ```json
   {"id":1,"result":{"pk":"123","username":"your_user","fullName":"Your Name"}}
   ```

3. **Test getThreads**
   ```json
   {"id":2,"method":"getThreads","params":{}}
   ```
   Expected response:
   ```json
   {"id":2,"result":[{"threadId":"123","users":[...],"lastMessage":"Hey","unreadCount":0}]}
   ```

4. **Test error handling**
   ```json
   {"id":3,"method":"unknownMethod","params":{}}
   ```
   Expected response:
   ```json
   {"id":3,"error":{"code":-32601,"message":"Method not found: unknownMethod"}}
   ```

---

## Environment Setup

Create a `.env` file in the backend directory:

```env
IG_USERNAME=your_instagram_username
IG_PASSWORD=your_instagram_password
```

Update `instagram.ts` to use dotenv:

```typescript
import 'dotenv/config';

// Use in login if no params provided
const username = params.username || process.env.IG_USERNAME;
const password = params.password || process.env.IG_PASSWORD;
```

**Important:** Add `.env` and `session.json` to `.gitignore`

---

## File Dependencies

```
types.ts (no dependencies)
    │
    ├──> instagram.ts (imports types)
    │         │
    └─────────┴──> server.ts (imports both)
```

---

## Next Steps After Phase 1

Once the backend is working:

1. **Phase 2** - Build the Go TUI that spawns this backend as a subprocess
2. **Phase 3** - Implement full communication protocol
3. **Phase 4** - Add `getMessages` and conversation view
4. **Phase 5** - Add `sendMessage` and real-time MQTT updates
