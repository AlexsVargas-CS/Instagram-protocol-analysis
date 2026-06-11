// Wire protocol shapes — kept identical to the daemon (packages/backend/src/types.ts)
// and the Go TUI so all three clients speak the same JSON-RPC over WebSocket.

export interface User {
  pk: string;
  username: string;
}

export interface Message {
  itemId?: string;
  text: string;
  timestamp: number;
  userId: string;
}

export interface Thread {
  thread_id: string;
  users: User[];
  lastMessage: Message;
  unreadCount: number;
  lastActivityAt: number;
  is_group: boolean;
}

export interface GetThreadsResult {
  threads: Thread[];
  oldestCursor: string | null;
  hasOlder: boolean;
}

export interface GetMessagesResult {
  messages: Message[];
  oldestCursor: string | null;
  hasOlder: boolean;
}

// Server-initiated events (no id).
export interface SessionRestoredEvent {
  success: boolean;
  user?: User;
}

export interface NewMessageEvent {
  threadId: string;
  message: Message;
}

export interface RealtimeErrorEvent {
  error: string;
}
