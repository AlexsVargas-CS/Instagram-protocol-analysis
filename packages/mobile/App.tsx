import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, SafeAreaView, StatusBar, StyleSheet, View, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import { colors, fontMap } from './src/theme';
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
  // Mute and archive are local-only for now — the daemon has no mute list, and a plain
  // refetch would otherwise resurrect an archived row. Keeping the ids outside `threads`
  // means both survive a refetch.
  const [mutedIds, setMutedIds] = useState<string[]>([]);
  const [archivedIds, setArchivedIds] = useState<string[]>([]);

  const [fontsLoaded] = useFonts(fontMap);

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

  // Patch one message in place. Messages without an itemId fall back to the same
  // timestamp-index key the conversation list uses, so both sides agree on identity.
  const patchMessage = useCallback((threadId: string, id: string, patch: Partial<Message>) => {
    setMessagesByThread((prev) => {
      const list = prev[threadId];
      if (!list) return prev;
      return {
        ...prev,
        [threadId]: list.map((m, i) =>
          (m.itemId ?? `${m.timestamp}-${i}`) === id ? { ...m, ...patch } : m,
        ),
      };
    });
  }, []);

  // Push a message over the wire and reflect the outcome on the bubble. Unlike v1 the
  // rejection is no longer swallowed — the optimistic message stays put and goes to
  // `failed` so the row can offer a retry.
  const deliver = useCallback(
    async (threadId: string, id: string, body: string) => {
      const client = clientRef.current;
      if (!client) {
        patchMessage(threadId, id, { status: 'failed' });
        return;
      }
      try {
        await client.send('sendMessage', { thread_id: threadId, text: body });
        patchMessage(threadId, id, { status: 'sent' });
      } catch {
        patchMessage(threadId, id, { status: 'failed' });
      }
    },
    [patchMessage],
  );

  // Send to the active thread with an optimistic local append. The daemon drops
  // self-echoes, so the sent message won't arrive back via newMessage — no duplicate.
  const sendMessage = useCallback(
    async (text: string, replyTo: { name: string; text: string } | null) => {
      const body = text.trim();
      const threadId = activeThreadIdRef.current;
      if (!body || !threadId) return;
      const id = `local-${Date.now()}`;
      const optimistic: Message = {
        text: body,
        userId: user?.pk ?? '',
        timestamp: Date.now() * 1000,
        itemId: id,
        status: 'sending',
        ...(replyTo ? { replyTo } : {}),
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
      await deliver(threadId, id, body);
    },
    [user, deliver],
  );

  const retryMessage = useCallback(
    (id: string) => {
      const threadId = activeThreadIdRef.current;
      if (!threadId) return;
      const list = messagesByThread[threadId] || [];
      const found = list.find((m, i) => (m.itemId ?? `${m.timestamp}-${i}`) === id);
      if (!found) return;
      patchMessage(threadId, id, { status: 'sending' });
      deliver(threadId, id, found.text);
    },
    [messagesByThread, patchMessage, deliver],
  );

  // Reactions are local-only: there's no reactMessage RPC yet, so tapping the same
  // emoji twice clears it and nothing leaves the device.
  const reactMessage = useCallback(
    (id: string, emoji: string) => {
      const threadId = activeThreadIdRef.current;
      if (!threadId) return;
      const list = messagesByThread[threadId] || [];
      const found = list.find((m, i) => (m.itemId ?? `${m.timestamp}-${i}`) === id);
      patchMessage(threadId, id, { reaction: found?.reaction === emoji ? undefined : emoji });
    },
    [messagesByThread, patchMessage],
  );

  const markThreadRead = useCallback((thread: Thread) => {
    setThreads((prev) =>
      prev.map((t) => (t.thread_id === thread.thread_id ? { ...t, unreadCount: 0 } : t)),
    );
    // The daemon's markRead needs the item to mark up to; without one there's nothing
    // to report and the local clear stands on its own.
    const itemId = thread.lastMessage?.itemId;
    if (itemId) {
      clientRef.current
        ?.send('markRead', { thread_id: thread.thread_id, item_id: itemId })
        .catch(() => {});
    }
  }, []);

  const toggleMute = useCallback((thread: Thread) => {
    setMutedIds((prev) =>
      prev.includes(thread.thread_id)
        ? prev.filter((id) => id !== thread.thread_id)
        : [...prev, thread.thread_id],
    );
  }, []);

  const archiveThread = useCallback((thread: Thread) => {
    setArchivedIds((prev) =>
      prev.includes(thread.thread_id) ? prev : [...prev, thread.thread_id],
    );
  }, []);

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

  // Local mute/archive folded onto the server's thread list.
  const visibleThreads = useMemo(
    () =>
      threads
        .filter((t) => !archivedIds.includes(t.thread_id))
        .map((t) => (mutedIds.includes(t.thread_id) ? { ...t, muted: true } : t)),
    [threads, archivedIds, mutedIds],
  );

  const activeThread = activeThreadId
    ? (threads.find((t) => t.thread_id === activeThreadId) ?? null)
    : null;

  let body: React.ReactNode;
  if (phase === 'loading' || !fontsLoaded) {
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
        onReact={reactMessage}
        onRetry={retryMessage}
      />
    );
  } else {
    body = (
      <ThreadsScreen
        user={user}
        threads={visibleThreads}
        connStatus={connStatus}
        onOpenThread={openThread}
        onReconfigure={onReconfigure}
        onMarkRead={markThreadRead}
        onToggleMute={toggleMute}
        onArchive={archiveThread}
      />
    );
  }

  return (
    <GestureHandlerRootView style={styles.gestureRoot}>
      <SafeAreaView style={styles.root}>
        <StatusBar barStyle="light-content" backgroundColor={colors.shelf} />
        {body}
      </SafeAreaView>
    </GestureHandlerRootView>
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
  gestureRoot: { flex: 1, backgroundColor: colors.shelf },
  root: {
    flex: 1,
    backgroundColor: colors.shelf,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) : 0,
  },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textDim, fontSize: 16 },
});
