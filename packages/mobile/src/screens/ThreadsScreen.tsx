import React, { useState } from 'react';
import { View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import { colors, fonts } from '../theme';
import { Thread, User } from '../protocol';
import { ConnStatus } from '../rpc';

export function threadName(thread: Thread, meUserId: string | null): string {
  const others = (thread.users || []).filter((u) => u.pk !== meUserId);
  const names = (others.length ? others : thread.users || []).map((u) => u.username).filter(Boolean);
  return names.length ? names.join(', ') : 'Conversation';
}

// Deterministic, desaturated tint per conversation so initials read as calm color-coding
// rather than loud avatars. Dark tinted circle + a brighter letter of the same hue.
const AVATAR_PALETTE = [
  { bg: '#1f3b2e', fg: '#86c46f' }, // green
  { bg: '#1d2f4a', fg: '#6fa3dd' }, // blue
  { bg: '#332f4a', fg: '#a08fd6' }, // indigo
  { bg: '#3a2a45', fg: '#c184d4' }, // purple
  { bg: '#13393a', fg: '#5fc4c4' }, // teal
  { bg: '#3a3320', fg: '#d4b46a' }, // amber
  { bg: '#3a2626', fg: '#d68a8a' }, // rose
];

function avatarStyle(name: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initial(name: string): string {
  const c = (name || '').trim().charAt(0);
  return c ? c.toUpperCase() : '?';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Timestamps arrive as microseconds (Date.now() * 1000); normalize and render the
// compact, scannable form the mockup uses: time today, "Yesterday", weekday, then date.
function formatTimestamp(raw?: number): string {
  if (!raw) return '';
  const ms = raw > 1e14 ? Math.floor(raw / 1000) : raw;
  const then = new Date(ms);
  if (isNaN(then.getTime())) return '';
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / 86400000);
  if (dayDiff <= 0) {
    let h = then.getHours();
    const m = then.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12;
    if (h === 0) h = 12;
    return `${h}:${m < 10 ? '0' + m : m} ${ampm}`;
  }
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff < 7) return DAYS[then.getDay()];
  return `${then.getMonth() + 1}/${then.getDate()}`;
}

// A hand-drawn magnifier (no icon dependency in this Expo build) that tints when active.
function SearchIcon({ active }: { active?: boolean }) {
  const c = active ? colors.unread : colors.textDim;
  return (
    <View style={styles.searchIcon}>
      <View style={[styles.searchRing, { borderColor: c }]} />
      <View style={[styles.searchHandle, { backgroundColor: c }]} />
    </View>
  );
}

// Unread is "subtle by design": a soft-green pill carrying the count, nothing when read.
// (The mockup's lone "new since opened" dot has no backing signal in the protocol yet,
// so it's intentionally omitted rather than faked.)
function UnreadBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
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
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const visible = q
    ? threads.filter((t) => {
        const n = threadName(t, meUserId).toLowerCase();
        const p = (t.lastMessage?.text || '').toLowerCase();
        return n.includes(q) || p.includes(q);
      })
    : threads;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>DMs</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => {
              setSearching((s) => !s);
              if (searching) setQuery('');
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <SearchIcon active={searching} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onReconfigure}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            style={styles.gearBtn}
          >
            <Text style={styles.gear}>⚙</Text>
          </TouchableOpacity>
        </View>
      </View>

      {searching && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Search conversations"
            placeholderTextColor={colors.textFaint}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      )}

      {/* Connection status lives off the list (per the design); only surface a slim,
          unobtrusive strip when something's wrong. */}
      {connStatus !== 'open' && (
        <View style={styles.connStrip}>
          <View style={styles.connDot} />
          <Text style={styles.connStripText}>
            {connStatus === 'connecting' ? 'Connecting…' : 'Offline'}
          </Text>
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(t) => t.thread_id}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <Text style={styles.empty}>
            {q
              ? 'No matches.'
              : connStatus === 'open'
                ? 'No conversations yet.'
                : 'Connecting…'}
          </Text>
        }
        renderItem={({ item }) => {
          const name = threadName(item, meUserId);
          const av = avatarStyle(name);
          const time = formatTimestamp(item.lastActivityAt || item.lastMessage?.timestamp);
          const previewRaw = (item.lastMessage?.text || '').trim();
          const preview = previewRaw || '[media]';
          const isTag = !previewRaw || /^\[.+\]$/.test(previewRaw);
          const unread = item.unreadCount || 0;
          return (
            <TouchableOpacity
              style={styles.row}
              activeOpacity={0.6}
              onPress={() => onOpenThread(item)}
            >
              <View style={[styles.avatar, { backgroundColor: av.bg }]}>
                <Text style={[styles.avatarText, { color: av.fg }]}>{initial(name)}</Text>
              </View>
              <View style={styles.rowBody}>
                <View style={styles.rowLine}>
                  <Text
                    style={[styles.name, unread > 0 && styles.nameUnread]}
                    numberOfLines={1}
                  >
                    {name}
                  </Text>
                  <Text style={styles.time}>{time}</Text>
                </View>
                <View style={styles.rowLine}>
                  <Text
                    style={[
                      styles.preview,
                      isTag && styles.previewTag,
                      unread > 0 && styles.previewUnread,
                    ]}
                    numberOfLines={1}
                  >
                    {preview}
                  </Text>
                  <UnreadBadge count={unread} />
                </View>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const AVATAR_SIZE = 44;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
  },
  brand: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    fontFamily: fonts.mono,
    letterSpacing: 0.5,
  },
  headerActions: { flexDirection: 'row', alignItems: 'center' },
  gearBtn: { marginLeft: 20 },
  gear: { color: colors.textDim, fontSize: 22 },

  // Hand-drawn magnifier inside a 22×22 box.
  searchIcon: { width: 22, height: 22 },
  searchRing: {
    position: 'absolute',
    top: 3,
    left: 3,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
  },
  searchHandle: {
    position: 'absolute',
    top: 13,
    left: 12,
    width: 7,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
  },

  searchBar: { paddingHorizontal: 20, paddingBottom: 12 },
  searchInput: {
    backgroundColor: colors.panel,
    color: colors.text,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: fonts.mono,
  },

  connStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  connDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.textFaint,
    marginRight: 8,
  },
  connStripText: { color: colors.textDim, fontSize: 13, fontFamily: fonts.mono },

  listContent: { paddingTop: 4, paddingBottom: 24 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  avatarText: { fontSize: 17, fontWeight: '700', fontFamily: fonts.mono },

  rowBody: { flex: 1, justifyContent: 'center' },
  rowLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    flex: 1,
    marginRight: 10,
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    fontFamily: fonts.mono,
  },
  nameUnread: { color: '#ffffff', fontWeight: '700' },
  time: { color: colors.textFaint, fontSize: 12, fontFamily: fonts.mono },

  preview: {
    flex: 1,
    marginRight: 10,
    marginTop: 4,
    color: colors.textDim,
    fontSize: 13,
    fontFamily: fonts.mono,
  },
  previewTag: { color: colors.textFaint },
  previewUnread: { color: colors.text },

  pill: {
    marginTop: 4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: colors.unread,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillText: { color: colors.unreadInk, fontSize: 12, fontWeight: '700', fontFamily: fonts.mono },

  empty: { color: colors.textDim, textAlign: 'center', marginTop: 48, fontSize: 14 },
});
