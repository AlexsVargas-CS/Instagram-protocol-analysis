import React, { useCallback, useEffect, useRef, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View, Text } from 'react-native';
import { colors } from './src/theme';
import { DaemonConfig, loadConfig, saveConfig, clearConfig } from './src/config';
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
    ? threads.find((t) => t.thread_id === activeThreadId) ?? null
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
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  loadingText: { color: colors.textDim, fontSize: 16 },
});
