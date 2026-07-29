// Wire protocol shapes — kept identical to the daemon (packages/backend/src/types.ts)
// and the Go TUI so all three clients speak the same JSON-RPC over WebSocket.

export interface User {
  pk: string;
  username: string;
}

// Delivery state of one of *your* messages. Client-side only: the daemon doesn't report
// per-message state yet, so this is set optimistically on send and on send failure.
export type MessageStatus = 'sending' | 'sent' | 'read' | 'failed';

export interface Message {
  itemId?: string;
  text: string;
  timestamp: number;
  userId: string;

  // Client-side additions. The UI renders each only when present, so these stay dark
  // until a daemon-side signal fills them in (see the redesign handoff's backend list).
  status?: MessageStatus;
  reaction?: string; // emoji, one per message
  replyTo?: { name: string; text: string };
}

export interface Thread {
  thread_id: string;
  users: User[];
  lastMessage: Message;
  unreadCount: number;
  lastActivityAt: number;
  is_group: boolean;

  // Client-side additions, as above.
  muted?: boolean; // local until a daemon mute list exists (it should suppress pushes too)
  typing?: boolean; // awaiting a `typing` event fanned out from the MQTT iris stream
  online?: boolean; // awaiting a presence signal
  lastSeenAt?: number; // awaiting thread.last_seen_at, for read receipts
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
