import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, SafeAreaView, StatusBar, StyleSheet, View, Text } from 'react-native';
import { colors } from './src/theme';
import { DaemonConfig, loadConfig, saveConfig, clearConfig } from './src/config';
import { registerForPushNotificationsAsync, addNotificationTapListener } from './src/notifications';
import { RpcClient, ConnStatus } from './src/rpc';
import {
  GetMessagesResult,
  GetThreadsResult,
  Message,
  NewMessageEvent,
  SessionRestoredEvent,
  Thread,
  User,
} from './src/protocol';
import { ConfigScreen } from './src/screens/ConfigScreen';
import { ThreadsScreen } from './src/screens/ThreadsScreen';
import { ConversationScreen } from './src/screens/ConversationScreen';

type Phase = 'loading' | 'config' | 'app';

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [config, setConfig] = useState<DaemonConfig | null>(null);
  const [connStatus, setConnStatus] = useState<ConnStatus>('connecting');
  const [user, setUser] = useState<User | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messagesByThread, setMessagesByThread] = useState<Record<string, Message[]>>({});
  const [loadingMessages, setLoadingMessages] = useState(false);

  const clientRef = useRef<RpcClient | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  activeThreadIdRef.current = activeThreadId;
  const threadsRef = useRef<Thread[]>([]);
  threadsRef.current = threads;
  const pushTokenRef = useRef<string | null>(null);
  const pendingDeepLinkRef = useRef<string | null>(null);

  // Load persisted config on first mount.
  useEffect(() => {
    loadConfig().then((cfg) => {
      if (cfg) {
        setConfig(cfg);
        setPhase('app');
      } else {
        setPhase('config');
      }
    });
  }, []);

  const fetchThreads = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    try {
      const res: GetThreadsResult = await client.send('getThreads');
      setThreads(dedupeThreads(res.threads || []));
    } catch {
      // transient; reconnect/refetch will retry
    }
  }, []);

  const applyNewMessage = useCallback((d: NewMessageEvent) => {
    // Append to the thread's message list (if loaded) and bubble it to the top.
    setMessagesByThread((prev) => {
      const existing = prev[d.threadId];
      if (!existing) return prev; // not loaded yet; will arrive on open
      return { ...prev, [d.threadId]: [...existing, d.message] };
    });
    setThreads((prev) => {
      const idx = prev.findIndex((t) => t.thread_id === d.threadId);
      if (idx < 0) return prev; // unknown thread; a refetch will surface it
      const t = { ...prev[idx], lastMessage: d.message, lastActivityAt: d.message.timestamp };
      if (activeThreadIdRef.current !== d.threadId) t.unreadCount = (t.unreadCount || 0) + 1;
      const next = [...prev];
      next.splice(idx, 1);
      return [t, ...next];
    });
  }, []);

  const handleEvent = useCallback(
    (event: string, data: any) => {
      if (event === 'sessionRestored') {
        const d = data as SessionRestoredEvent;
        setUser(d.success && d.user ? d.user : null);
        if (d.success) fetchThreads();
      } else if (event === 'newMessage') {
        applyNewMessage(data as NewMessageEvent);
      }
    },
    [fetchThreads, applyNewMessage],
  );

  // (Re)create the client whenever we enter the app with a config.
  useEffect(() => {
    if (phase !== 'app' || !config) return;
    const client = new RpcClient({
      address: config.address,
      token: config.token,
      onEvent: handleEvent,
      onStatus: setConnStatus,
    });
    clientRef.current = client;
    client.connect();
    return () => {
      client.close();
      clientRef.current = null;
    };
  }, [phase, config, handleEvent]);

  // Acquire the FCM device token once we're in the app, then hand it to the daemon.
  // The token is also (re)sent on every (re)connect below, so a token that resolves
  // before or after the socket opens is covered either way.
  useEffect(() => {
    if (phase !== 'app') return;
    registerForPushNotificationsAsync().then((token) => {
      pushTokenRef.current = token;
      if (token) clientRef.current?.send('registerPushToken', { token }).catch(() => {});
    });
  }, [phase]);

  // Re-register the device token whenever the socket (re)opens — the daemon keeps
  // tokens in memory only, so clients must re-announce after a daemon restart.
  useEffect(() => {
    if (connStatus === 'open' && pushTokenRef.current) {
      clientRef.current?.send('registerPushToken', { token: pushTokenRef.current }).catch(() => {});
    }
  }, [connStatus]);

  const openThread = useCallback(
    async (thread: Thread) => {
      setActiveThreadId(thread.thread_id);
      // Clear this thread's unread locally.
      setThreads((prev) =>
        prev.map((t) => (t.thread_id === thread.thread_id ? { ...t, unreadCount: 0 } : t)),
      );
      const client = clientRef.current;
      if (!client) return;
      if (messagesByThread[thread.thread_id]) return; // cached
      setLoadingMessages(true);
      try {
        const res: GetMessagesResult = await client.send('getMessages', {
          thread_id: thread.thread_id,
        });
        setMessagesByThread((prev) => ({ ...prev, [thread.thread_id]: res.messages || [] }));
      } catch {
        // leave empty; user can back out and retry
      } finally {
        setLoadingMessages(false);
      }
    },
    [messagesByThread],
  );

  // Open a thread by id (used by notification deep-links). If the thread isn't in
  // the list yet (cold start before threads load), remember it and resolve once
  // the list arrives.
  const openThreadById = useCallback(
    (threadId: string) => {
      const t = threadsRef.current.find((x) => x.thread_id === threadId);
      if (t) {
        openThread(t);
      } else {
        pendingDeepLinkRef.current = threadId;
        fetchThreads();
      }
    },
    [openThread, fetchThreads],
  );

  // Send a message to the active thread with an optimistic local append. The daemon
  // drops self-echoes, so the sent message won't arrive back via newMessage — no
  // duplicate. A failed send is left in place for v1 (a reload reconciles).
  const sendMessage = useCallback(
    async (text: string) => {
      const body = text.trim();
      const client = clientRef.current;
      const threadId = activeThreadIdRef.current;
      if (!body || !client || !threadId) return;
      const optimistic: Message = {
        text: body,
        userId: user?.pk ?? '',
        timestamp: Date.now() * 1000,
        itemId: `local-${Date.now()}`,
      };
      setMessagesByThread((prev) => {
        const existing = prev[threadId] || [];
        return { ...prev, [threadId]: [...existing, optimistic] };
      });
      setThreads((prev) => {
        const idx = prev.findIndex((x) => x.thread_id === threadId);
        if (idx < 0) return prev;
        const updated = {
          ...prev[idx],
          lastMessage: optimistic,
          lastActivityAt: optimistic.timestamp,
        };
        const next = [...prev];
        next.splice(idx, 1);
        return [updated, ...next];
      });
      try {
        await client.send('sendMessage', { thread_id: threadId, text: body });
      } catch {
        // transient; the message stays optimistically appended
      }
    },
    [user],
  );

  // Deep-link: tapping a push (foreground/background or cold start) opens its thread.
  useEffect(() => {
    if (phase !== 'app') return;
    return addNotificationTapListener(openThreadById);
  }, [phase, openThreadById]);

  // Resolve a pending deep-link once the thread list contains the target thread.
  useEffect(() => {
    const id = pendingDeepLinkRef.current;
    if (!id) return;
    const t = threads.find((x) => x.thread_id === id);
    if (t) {
      pendingDeepLinkRef.current = null;
      openThread(t);
    }
  }, [threads, openThread]);

  const onSaveConfig = useCallback((cfg: DaemonConfig) => {
    saveConfig(cfg).then(() => {
      setConfig(cfg);
      setPhase('app');
    });
  }, []);

  const onReconfigure = useCallback(() => {
    clientRef.current?.close();
    clientRef.current = null;
    clearConfig().then(() => {
      setThreads([]);
      setMessagesByThread({});
      setUser(null);
      setActiveThreadId(null);
      setPhase('config');
    });
  }, []);

  const activeThread = activeThreadId
    ? (threads.find((t) => t.thread_id === activeThreadId) ?? null)
    : null;

  let body: React.ReactNode;
  if (phase === 'loading') {
    body = (
      <View style={styles.center}>
        <Text style={styles.loadingText}>Loading…</Text>
      </View>
    );
  } else if (phase === 'config') {
    body = <ConfigScreen initial={config} onSave={onSaveConfig} />;
  } else if (activeThread) {
    body = (
      <ConversationScreen
        thread={activeThread}
        messages={messagesByThread[activeThread.thread_id] || []}
        user={user}
        loading={loadingMessages}
        onBack={() => setActiveThreadId(null)}
        onSend={sendMessage}
      />
    );
  } else {
    body = (
      <ThreadsScreen
        user={user}
        threads={threads}
        connStatus={connStatus}
        onOpenThread={openThread}
        onReconfigure={onReconfigure}
      />
    );
  }

  return (
    <SafeAreaView style={styles.root}>
      <StatusBar barStyle="light-content" backgroundColor={colors.bg} />
      {body}
    </SafeAreaView>
  );
}

function dedupeThreads(threads: Thread[]): Thread[] {
  const seen = new Set<string>();
  const out: Thread[] = [];
  for (const t of threads) {
    if (seen.has(t.thread_id)) continue;
    seen.add(t.thread_id);
    out.push(t);
  }
  return out;
}

const styles = StyleSheet.create({
  // RN core's SafeAreaView only insets on iOS (Android renders it as a plain View),
  // so Android needs the status bar height added back manually.
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textDim, fontSize: 16 },
});
