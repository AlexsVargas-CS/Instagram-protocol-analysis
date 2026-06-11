import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { Thread, User } from '../protocol';
import { ConnStatus } from '../rpc';

export function threadName(thread: Thread, meUserId: string | null): string {
  const others = (thread.users || []).filter((u) => u.pk !== meUserId);
  const names = (others.length ? others : thread.users || []).map((u) => u.username).filter(Boolean);
  return names.length ? names.join(', ') : 'Conversation';
}

export function ThreadsScreen({
  user,
  threads,
  connStatus,
  onOpenThread,
  onReconfigure,
}: {
  user: User | null;
  threads: Thread[];
  connStatus: ConnStatus;
  onOpenThread: (thread: Thread) => void;
  onReconfigure: () => void;
}) {
  const meUserId = user?.pk ?? null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Messages</Text>
          <Text style={styles.subtitle}>
            {user ? `@${user.username}` : 'Not signed in'} · {statusLabel(connStatus)}
          </Text>
        </View>
        <TouchableOpacity onPress={onReconfigure}>
          <Text style={styles.gear}>⚙</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={threads}
        keyExtractor={(t) => t.thread_id}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {connStatus === 'open' ? 'No conversations yet.' : 'Connecting…'}
          </Text>
        }
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => onOpenThread(item)}>
            <View style={styles.rowText}>
              <Text style={styles.name} numberOfLines={1}>
                {threadName(item, meUserId)}
              </Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.lastMessage?.text || ''}
              </Text>
            </View>
            {item.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.unreadCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

function statusLabel(s: ConnStatus): string {
  if (s === 'open') return 'connected';
  if (s === 'connecting') return 'connecting…';
  return 'disconnected';
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700' },
  subtitle: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  gear: { color: colors.textDim, fontSize: 22 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowText: { flex: 1, marginRight: 10 },
  name: { color: colors.text, fontSize: 16, fontWeight: '600' },
  preview: { color: colors.textDim, fontSize: 14, marginTop: 3 },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 11,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40, fontSize: 14 },
});
