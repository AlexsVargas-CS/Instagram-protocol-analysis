# Library Analysis: instagram-private-api

Notes from studying the [instagram-private-api](https://github.com/dilame/instagram-private-api) and [instagram_mqtt](https://github.com/Nerixyz/instagram_mqtt) libraries.

## Repository Structure

### instagram-private-api
```
instagram-private-api/
├── src/
│   ├── core/
│   │   ├── client.ts          # Main IgApiClient class
│   │   ├── state.ts           # Session state management
│   │   ├── request.ts         # HTTP request handler
│   │   └── feed.ts            # Feed pagination base
│   ├── repositories/          # API endpoint implementations
│   │   ├── account.repository.ts
│   │   ├── direct.repository.ts
│   │   ├── media.repository.ts
│   │   └── ...
│   ├── feeds/                 # Paginated data feeds
│   │   ├── inbox.feed.ts
│   │   ├── timeline.feed.ts
│   │   └── ...
│   ├── types/                 # TypeScript interfaces
│   └── errors/                # Custom error classes
```

### instagram_mqtt
```
instagram_mqtt/
├── src/
│   ├── realtime/
│   │   ├── realtime.client.ts  # MQTT realtime client
│   │   ├── parsers/            # Message parsers
│   │   └── subscriptions/      # GraphQL subscriptions
│   ├── fbns/
│   │   └── fbns.client.ts      # Push notifications
│   └── mqttot/                 # Modified MQTT protocol
```

---

## Key Classes to Study

### IgApiClient (Main Entry Point)
```typescript
// Location: src/core/client.ts
class IgApiClient {
  state: State;           // Session management
  request: Request;       // HTTP requests
  account: AccountRepository;
  direct: DirectRepository;
  // ... other repositories
}
```

### State Management
```typescript
// Location: src/core/state.ts
class State {
  // Device identifiers
  deviceId: string;
  phoneId: string;
  adid: string;
  
  // Generate consistent device profile
  generateDevice(seed: string): void;
  
  // Serialize/deserialize for session persistence
  serialize(): SerializedState;
  deserialize(state: SerializedState): void;
}
```

### Direct Messaging Repository
```typescript
// Location: src/repositories/direct.repository.ts
class DirectRepository {
  // Get inbox threads
  async getInbox(): Promise<DirectInboxResponse>;
  
  // Get specific thread
  async getThread(threadId: string): Promise<DirectThreadResponse>;
  
  // Send text message
  async sendText(options: {
    userIds?: string[];
    threadIds?: string[];
    text: string;
  }): Promise<DirectSendResponse>;
}
```

---

## How They Handle Authentication

### Password Encryption
```typescript
// They use Instagram's public key to encrypt passwords
// The encryption scheme is AES-GCM-256

async encryptPassword(password: string): Promise<string> {
  // Fetch public key from Instagram
  const publicKey = await this.getPublicKey();
  
  // Encrypt with timestamp
  const timestamp = Date.now().toString();
  const encrypted = await this.aesGcmEncrypt(password, publicKey);
  
  return `#PWD_INSTAGRAM:4:${timestamp}:${encrypted}`;
}
```

### Device Generation
```typescript
// They generate consistent device IDs from username seed
generateDevice(seed: string): void {
  const hash = crypto.createHash('md5').update(seed).digest('hex');
  
  this.deviceId = `android-${hash.substring(0, 16)}`;
  this.phoneId = this.generateUUID(hash);
  this.adid = this.generateUUID(hash);
}
```

---

## How They Handle Challenges

```typescript
// Location: src/repositories/challenge.repository.ts

class ChallengeRepository {
  // Auto-select verification method
  async auto(reset: boolean = false): Promise<ChallengeStateResponse>;
  
  // Send security code
  async sendSecurityCode(code: string): Promise<ChallengeStateResponse>;
  
  // Reset challenge
  async reset(): Promise<ChallengeStateResponse>;
}

// Usage in login flow
async login(username: string, password: string) {
  try {
    return await this.account.login(username, password);
  } catch (error) {
    if (error instanceof IgCheckpointError) {
      // Handle challenge
      await this.challenge.auto(true);
      // ... get code from user
      await this.challenge.sendSecurityCode(code);
    }
    throw error;
  }
}
```

---

## How They Build Requests

### Request Signing
```typescript
// Some requests need to be signed
const signedBody = this.signature.sign({
  username,
  password: encryptedPassword,
  device_id: this.state.deviceId,
  // ... other params
});

// Result format: SIGNATURE.JSON_PAYLOAD
```

### Headers Generation
```typescript
// Location: src/core/request.ts

getDefaultHeaders() {
  return {
    'User-Agent': this.state.appUserAgent,
    'X-IG-App-ID': '567067343352427',
    'X-IG-Device-ID': this.state.deviceId,
    'X-IG-Android-ID': this.state.deviceId,
    'X-IG-Connection-Type': 'WIFI',
    'X-IG-Capabilities': this.state.capabilities,
    // ... etc
  };
}
```

---

## MQTT Implementation

### RealtimeClient
```typescript
// Location: instagram_mqtt/src/realtime/realtime.client.ts

class RealtimeClient extends EventEmitter {
  // Connect to MQTT broker
  async connect(options: RealtimeClientConnectOptions): Promise<void>;
  
  // Subscribe to GraphQL subscriptions
  async graphQlSubscribe(subscription: GraphQLSubscription): Promise<void>;
  
  // Send direct message via MQTT
  async direct.sendText(threadId: string, text: string): Promise<void>;
}
```

### Message Parsing
```typescript
// They parse different message types
// Location: src/realtime/parsers/

// Direct messages
class DirectMessageParser {
  parse(data: Buffer): DirectMessage;
}

// Typing indicators
class TypingParser {
  parse(data: Buffer): TypingEvent;
}
```

---

## Interesting Patterns

### Feed Pagination
```typescript
// All feeds extend FeedBase
abstract class FeedBase<T> {
  protected moreAvailable: boolean = true;
  protected nextCursor: string;
  
  // Async iterator support
  async *[Symbol.asyncIterator]() {
    while (this.moreAvailable) {
      const items = await this.items();
      for (const item of items) {
        yield item;
      }
    }
  }
}

// Usage
for await (const item of ig.feed.inbox()) {
  console.log(item);
}
```

### Error Handling
```typescript
// Custom error classes for different failure modes
class IgLoginBadPasswordError extends IgClientError {}
class IgCheckpointError extends IgClientError {}
class IgChallengeWrongCodeError extends IgClientError {}
class IgLoginTwoFactorRequiredError extends IgClientError {}
```

---

## What To Implement First

Based on studying these libraries, here's the recommended order:

1. **State Management**
   - Device ID generation
   - Session serialization

2. **HTTP Request Layer**
   - Header generation
   - Cookie handling
   - Request signing

3. **Authentication**
   - Login flow
   - Challenge handling
   - Session persistence

4. **Direct Messaging (REST)**
   - Get inbox
   - Send message
   - Mark as read

5. **MQTT Integration** (advanced)
   - Real-time messages
   - Typing indicators

---

## Code Snippets to Reference

### Minimal Login Example
```typescript
import { IgApiClient } from 'instagram-private-api';

const ig = new IgApiClient();
ig.state.generateDevice(username);

await ig.simulate.preLoginFlow();
const loggedInUser = await ig.account.login(username, password);
await ig.simulate.postLoginFlow();

console.log('Logged in as:', loggedInUser.username);
```

### Send DM Example
```typescript
const thread = await ig.direct.createThread(['recipient_user_id']);
await ig.direct.sendText({
  threadIds: [thread.thread_id],
  text: 'Hello from API!'
});
```

### Save/Restore Session
```typescript
// Save
const serialized = ig.state.serialize();
delete serialized.constants; // Remove large constants
fs.writeFileSync('session.json', JSON.stringify(serialized));

// Restore
const session = JSON.parse(fs.readFileSync('session.json'));
await ig.state.deserialize(session);
```

---

## Next Steps

- [ ] Clone and run instagram-private-api locally
- [ ] Step through login flow with debugger
- [ ] Trace how headers are constructed
- [ ] Understand signature generation
- [ ] Study MQTT connection setup
