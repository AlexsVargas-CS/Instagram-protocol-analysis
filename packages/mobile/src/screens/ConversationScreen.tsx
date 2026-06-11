import React from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme';
import { Message, Thread, User } from '../protocol';
import { threadName } from './ThreadsScreen';

export function ConversationScreen({
  thread,
  messages,
  user,
  loading,
  onBack,
}: {
  thread: Thread;
  messages: Message[];
  user: User | null;
  loading: boolean;
  onBack: () => void;
}) {
  const meUserId = user?.pk ?? null;
  // Newest at the bottom: render inverted so new messages appear at the bottom and
  // the list opens scrolled to the latest.
  const data = [...messages].reverse();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {threadName(thread, meUserId)}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {loading && messages.length === 0 ? (
        <Text style={styles.empty}>Loading messages…</Text>
      ) : (
        <FlatList
          data={data}
          inverted
          keyExtractor={(m, i) => m.itemId ?? `${m.timestamp}-${i}`}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const mine = meUserId != null && item.userId === meUserId;
            return (
              <View style={[styles.bubbleRow, mine ? styles.rowMine : styles.rowTheirs]}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
                  <Text style={styles.bubbleText}>{item.text}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  back: { color: colors.accent, fontSize: 30, lineHeight: 30, width: 24 },
  title: { color: colors.text, fontSize: 17, fontWeight: '600', flex: 1, textAlign: 'center' },
  listContent: { paddingHorizontal: 12, paddingVertical: 12 },
  bubbleRow: { marginVertical: 4, flexDirection: 'row' },
  rowMine: { justifyContent: 'flex-end' },
  rowTheirs: { justifyContent: 'flex-start' },
  bubble: { maxWidth: '78%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 9 },
  bubbleMine: { backgroundColor: colors.bubbleMe, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: colors.bubbleThem, borderBottomLeftRadius: 4 },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 20 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 40, fontSize: 14 },
});
