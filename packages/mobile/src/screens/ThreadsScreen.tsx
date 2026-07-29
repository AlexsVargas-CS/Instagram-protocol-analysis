import React, { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolateColor,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { colors, density, fonts, layout, radius, spring } from '../theme';
import { Thread, User } from '../protocol';
import { ConnStatus } from '../rpc';
import { Monogram, Toast, TypingDots } from '../components';
import { useBackHandler } from '../useBackHandler';
import {
  ArchiveIcon,
  BellOffGlyph,
  BellOffIcon,
  DoubleCheckIcon,
  GearIcon,
  MagnifierIcon,
} from '../icons';

export function threadName(thread: Thread, meUserId: string | null): string {
  const others = (thread.users || []).filter((u) => u.pk !== meUserId);
  const names = (others.length ? others : thread.users || [])
    .map((u) => u.username)
    .filter(Boolean);
  return names.length ? names.join(', ') : 'Conversation';
}

function initial(name: string): string {
  const c = (name || '').replace(/[^a-z0-9]/gi, '').charAt(0);
  return c ? c.toUpperCase() : '?';
}

// Group tiles carry 1–2 letters taken from the first letters of the name's words.
function groupInitials(name: string): string {
  const words = (name || '').split(/[\s,]+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w.replace(/[^a-z0-9]/gi, '').charAt(0));
  const out = letters.join('').toUpperCase();
  return out || '?';
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Timestamps arrive as microseconds (Date.now() * 1000); normalize and render the
// compact, scannable form: time today, "Yesterday", weekday, then date.
export function formatTimestamp(raw?: number): string {
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

const OPEN = layout.swipeOpen; // -190
const ROW_PAD = density.regular;

// The row resists past the tray and past the closed edge instead of tracking the finger
// 1:1 — the elastic half of the M3 Expressive swipe.
function rubber(x: number): number {
  'worklet';
  if (x > 0) return Math.min(30, x * 0.26);
  if (x < OPEN) return OPEN + (x - OPEN) * 0.3;
  return x;
}

function GroupTile({
  thread,
  meUserId,
  onPress,
}: {
  thread: Thread;
  meUserId: string | null;
  onPress: () => void;
}) {
  const name = threadName(thread, meUserId);
  const unread = (thread.unreadCount || 0) > 0;
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => {
        scale.value = withTiming(0.95, { duration: 160 });
      }}
      onPressOut={() => {
        scale.value = withTiming(1, { duration: 160 });
      }}
    >
      <Animated.View style={[styles.tileWrap, style]}>
        <View style={[styles.tile, unread && styles.tileUnread]}>
          <Text style={[styles.tileInitials, unread && styles.tileInitialsUnread]}>
            {groupInitials(name)}
          </Text>
          {unread && (
            <View style={styles.tileBadge}>
              <Text style={styles.tileBadgeText}>
                {thread.unreadCount > 99 ? '99+' : thread.unreadCount}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.tileName, unread && styles.tileNameUnread]} numberOfLines={1}>
          {name}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

function ThreadRow({
  item,
  index,
  meUserId,
  dragX,
  activeIndex,
  showTray,
  isOpen,
  onOpen,
  onSwipeStart,
  onOpened,
  onClosed,
  onRequestClose,
  onMarkRead,
  onToggleMute,
  onArchive,
}: {
  item: Thread;
  index: number;
  meUserId: string | null;
  dragX: SharedValue<number>;
  activeIndex: SharedValue<number>;
  showTray: boolean;
  isOpen: boolean;
  onOpen: (t: Thread) => void;
  onSwipeStart: (id: string) => void;
  onOpened: (id: string) => void;
  onClosed: (id: string) => void;
  onRequestClose: () => void;
  onMarkRead: (t: Thread) => void;
  onToggleMute: (t: Thread) => void;
  onArchive: (t: Thread) => void;
}) {
  const base = useSharedValue(0);
  const press = useSharedValue(0);

  const name = threadName(item, meUserId);
  const unread = item.unreadCount || 0;
  const previewRaw = (item.lastMessage?.text || '').trim();
  const preview = previewRaw || '[media]';
  const time = formatTimestamp(item.lastActivityAt || item.lastMessage?.timestamp);
  // A receipt only shows once the thread is fully read and the daemon has told us the
  // other side saw it; until `lastSeenAt` is wired up this simply never renders.
  const showReceipt =
    unread === 0 &&
    !!item.lastSeenAt &&
    !!item.lastMessage &&
    item.lastMessage.userId === meUserId &&
    item.lastSeenAt >= item.lastMessage.timestamp;

  const pan = useMemo(
    () =>
      Gesture.Pan()
        // Let the FlatList win vertical drags, and don't steal small taps.
        .activeOffsetX([-12, 12])
        .failOffsetY([-16, 16])
        .onStart(() => {
          // Dragging a row other than the open one starts it from closed. This lives in
          // onStart, not onBegin, so a plain tap on a neighbour never disturbs the open row.
          if (activeIndex.value !== index) dragX.value = 0;
          activeIndex.value = index;
          base.value = dragX.value;
          runOnJS(onSwipeStart)(item.thread_id);
        })
        .onUpdate((e) => {
          dragX.value = rubber(base.value + e.translationX);
        })
        .onEnd((e) => {
          // A flick past ~450px/s decides on its own; otherwise distance does.
          const open = e.velocityX < -450 ? true : e.velocityX > 450 ? false : dragX.value < -70;
          if (open) runOnJS(onOpened)(item.thread_id);
          // The one and only settle animation — seeded with the drag velocity so a flick
          // overshoots slightly and eases back. The tray is torn down only once it lands.
          dragX.value = withSpring(
            open ? OPEN : 0,
            { ...spring, velocity: e.velocityX },
            (finished) => {
              if (finished && !open) {
                activeIndex.value = -1;
                runOnJS(onClosed)(item.thread_id);
              }
            },
          );
        }),
    [index, item.thread_id, activeIndex, dragX, base, onSwipeStart, onOpened, onClosed],
  );

  // Neighbours "stick" to the dragged row and reach after it, falling off with distance —
  // the connected-interaction half of M3 Expressive.
  const rowStyle = useAnimatedStyle(() => {
    const ai = activeIndex.value;
    let dx = 0;
    if (ai >= 0) {
      const diff = Math.abs(index - ai);
      const follow = diff === 0 ? 1 : diff === 1 ? 0.15 : diff === 2 ? 0.06 : 0;
      dx = dragX.value * follow;
    }
    const sliding = dx < -0.5 ? 1 : 0;
    const lift = Math.max(press.value, sliding);
    return {
      transform: [{ translateX: dx }],
      borderRadius: lift * radius.row,
      backgroundColor: interpolateColor(press.value, [0, 1], [colors.bg, colors.shelf]),
    };
  });

  return (
    <View style={styles.rowHost}>
      {/* Rendered only for the row being dragged — never for the neighbours that follow it. */}
      {showTray && (
        <View style={styles.tray}>
          <Pressable
            style={[styles.trayCell, { backgroundColor: colors.readFill }]}
            onPress={() => onMarkRead(item)}
          >
            <DoubleCheckIcon size={17} color={colors.accent} strokeWidth={2} />
            <Text style={[styles.trayLabel, { color: colors.accent }]}>READ</Text>
          </Pressable>
          <Pressable
            style={[styles.trayCell, { backgroundColor: colors.warnFill }]}
            onPress={() => onToggleMute(item)}
          >
            <BellOffIcon size={17} color={colors.warnIcon} />
            <Text style={[styles.trayLabel, { color: colors.warnLabel }]}>
              {item.muted ? 'UNMUTE' : 'MUTE'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.trayCell, { backgroundColor: colors.dangerFill }]}
            onPress={() => onArchive(item)}
          >
            <ArchiveIcon size={17} color={colors.dangerIcon} />
            <Text style={[styles.trayLabel, { color: colors.dangerLabel }]}>FILE</Text>
          </Pressable>
        </View>
      )}

      <GestureDetector gesture={pan}>
        <Animated.View style={rowStyle}>
          <Pressable
            style={styles.row}
            onPressIn={() => {
              press.value = withTiming(1, { duration: 140 });
            }}
            onPressOut={() => {
              press.value = withTiming(0, { duration: 140 });
            }}
            // Tapping an open row closes it rather than opening the thread.
            onPress={() => (isOpen ? onRequestClose() : onOpen(item))}
          >
            <View>
              <Monogram letter={initial(name)} unread={unread > 0} />
              {item.online && <View style={styles.presence} />}
            </View>

            <View style={styles.rowBody}>
              <View style={styles.nameLine}>
                <Text
                  style={[styles.name, unread > 0 ? styles.nameUnread : null]}
                  numberOfLines={1}
                >
                  {name}
                </Text>
                {item.muted && <BellOffGlyph />}
              </View>

              {item.typing ? (
                <View style={styles.typingLine}>
                  <TypingDots size={4} />
                  <Text style={styles.typingText}>typing</Text>
                </View>
              ) : (
                <Text
                  style={[styles.preview, unread > 0 ? styles.previewUnread : null]}
                  numberOfLines={1}
                >
                  {preview}
                </Text>
              )}
            </View>

            <View style={styles.rowMeta}>
              <Text style={[styles.time, unread > 0 ? styles.timeUnread : null]}>{time}</Text>
              {unread > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                </View>
              ) : showReceipt ? (
                <DoubleCheckIcon size={15} color={colors.textDimmer} />
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

export function ThreadsScreen({
  user,
  threads,
  connStatus,
  onOpenThread,
  onReconfigure,
  onMarkRead,
  onToggleMute,
  onArchive,
}: {
  user: User | null;
  threads: Thread[];
  connStatus: ConnStatus;
  onOpenThread: (thread: Thread) => void;
  onReconfigure: () => void;
  onMarkRead: (thread: Thread) => void;
  onToggleMute: (thread: Thread) => void;
  onArchive: (thread: Thread) => void;
}) {
  const meUserId = user?.pk ?? null;
  const dragX = useSharedValue(0);
  const activeIndex = useSharedValue(-1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const flash = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast((cur) => (cur === message ? null : cur)), 1800);
  }, []);

  const clearSwipe = useCallback(() => {
    setOpenId(null);
    setActiveRowId(null);
  }, []);

  // Close a row that isn't being dragged — a tap on the open row, or a tray action.
  // The gesture path runs its own velocity-seeded spring and never comes through here.
  const closeSwipe = useCallback(() => {
    dragX.value = withSpring(0, spring, (finished) => {
      if (finished) {
        activeIndex.value = -1;
        runOnJS(clearSwipe)();
      }
    });
  }, [dragX, activeIndex, clearSwipe]);

  // This is the app's home screen, so back only has work to do when a swipe tray is
  // open. With nothing to close we return false and let Android exit the app.
  useBackHandler(() => {
    if (openId) {
      closeSwipe();
      return true;
    }
    return false;
  });

  const onOpened = useCallback((id: string) => setOpenId(id), []);

  const onClosed = useCallback((id: string) => {
    setOpenId((cur) => (cur === id ? null : cur));
    setActiveRowId((cur) => (cur === id ? null : cur));
  }, []);

  const groups = useMemo(
    () =>
      threads
        .filter((t) => t.is_group)
        .sort(
          (a, b) =>
            (b.unreadCount || 0) - (a.unreadCount || 0) ||
            (b.lastActivityAt || 0) - (a.lastActivityAt || 0),
        ),
    [threads],
  );

  return (
    <View style={styles.container}>
      <View style={styles.shelf}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Messages</Text>
          <Pressable style={styles.settingsBtn} onPress={onReconfigure} hitSlop={8}>
            <GearIcon />
          </Pressable>
        </View>

        {groups.length > 0 && (
          <View style={styles.rail}>
            <View style={styles.railHead}>
              <Text style={styles.railLabel}>Most active groups</Text>
              <Text style={styles.railAll}>All</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.railScroll}
              contentContainerStyle={styles.railContent}
            >
              {groups.map((g) => (
                <GroupTile
                  key={g.thread_id}
                  thread={g}
                  meUserId={meUserId}
                  onPress={() => onOpenThread(g)}
                />
              ))}
            </ScrollView>
          </View>
        )}
      </View>

      <View style={styles.sheet}>
        <FlatList
          data={threads}
          keyExtractor={(t) => t.thread_id}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {connStatus === 'open' ? 'No conversations yet.' : 'Connecting…'}
            </Text>
          }
          renderItem={({ item, index }) => (
            <ThreadRow
              item={item}
              index={index}
              meUserId={meUserId}
              dragX={dragX}
              activeIndex={activeIndex}
              showTray={activeRowId === item.thread_id}
              isOpen={openId === item.thread_id}
              onOpen={onOpenThread}
              onSwipeStart={setActiveRowId}
              onOpened={onOpened}
              onClosed={onClosed}
              onRequestClose={closeSwipe}
              onMarkRead={(t) => {
                onMarkRead(t);
                closeSwipe();
                flash('Marked read');
              }}
              onToggleMute={(t) => {
                onToggleMute(t);
                closeSwipe();
                flash(t.muted ? 'Unmuted' : 'Muted · no pushes');
              }}
              onArchive={(t) => {
                onArchive(t);
                closeSwipe();
                flash('Filed away');
              }}
            />
          )}
        />
      </View>

      <Pressable style={styles.fab} onPress={() => flash('Search — coming soon')}>
        <MagnifierIcon />
      </Pressable>

      <Toast message={toast} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.shelf },

  shelf: { paddingTop: 6, paddingHorizontal: 20, gap: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: {
    color: colors.text,
    fontFamily: fonts.grotesk,
    fontSize: 27,
    lineHeight: 27,
    letterSpacing: -0.54,
  },
  settingsBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.settingsButton,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },

  rail: { marginTop: -4 },
  railHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  railLabel: {
    color: colors.sectionLabel,
    fontFamily: fonts.sansBold,
    fontSize: 10.5,
    letterSpacing: 1.575,
    textTransform: 'uppercase',
  },
  railAll: { color: colors.accent, fontFamily: fonts.sansSemi, fontSize: 11.5 },
  // Bled to the screen edges so tiles can run off the side.
  railScroll: { marginHorizontal: -20 },
  railContent: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 2, gap: 16 },

  tileWrap: { alignItems: 'center', gap: 7 },
  tile: {
    width: layout.groupTile,
    height: layout.groupTile,
    borderRadius: layout.groupTile / 2,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileUnread: { borderColor: colors.accent },
  tileInitials: {
    color: '#A9BAB6',
    fontFamily: fonts.grotesk,
    fontSize: 19,
    letterSpacing: 0.38,
  },
  tileInitialsUnread: { color: colors.accent },
  tileBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    borderWidth: 2.5,
    borderColor: colors.shelf,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileBadgeText: { color: colors.accentOn, fontFamily: fonts.sansBold, fontSize: 11 },
  tileName: {
    width: layout.groupTileLabel,
    textAlign: 'center',
    color: colors.textDim,
    fontFamily: fonts.sansMedium,
    fontSize: 11,
  },
  tileNameUnread: { color: colors.textStrong },

  sheet: {
    flex: 1,
    marginTop: 16,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    overflow: 'hidden',
    elevation: 18,
  },
  listContent: { paddingTop: 10, paddingBottom: 96 },

  rowHost: { position: 'relative', justifyContent: 'center' },
  tray: {
    position: 'absolute',
    top: 5,
    bottom: 5,
    right: 10,
    width: layout.swipeTrayWidth,
    borderRadius: radius.tray,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  trayCell: { width: layout.swipeCell, alignItems: 'center', justifyContent: 'center', gap: 3 },
  trayLabel: {
    fontFamily: fonts.sansSemi,
    fontSize: 8.5,
    letterSpacing: 0.34,
    textTransform: 'uppercase',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    paddingVertical: ROW_PAD,
    paddingHorizontal: 20,
  },
  presence: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 11,
    height: 11,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    borderWidth: 2.5,
    borderColor: colors.bg,
  },

  rowBody: { flex: 1, gap: 3 },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  name: { flexShrink: 1, color: colors.textStrong, fontFamily: fonts.groteskMedium, fontSize: 15 },
  nameUnread: { color: colors.text, fontFamily: fonts.grotesk },
  preview: { color: colors.textDim, fontFamily: fonts.sans, fontSize: 13, lineHeight: 17 },
  previewUnread: {
    color: colors.textUnreadPreview,
    fontFamily: fonts.sansMedium,
  },
  typingLine: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 17 },
  typingText: { color: colors.accent, fontFamily: fonts.sansMedium, fontSize: 13 },

  rowMeta: { alignItems: 'flex-end', gap: 7 },
  time: { color: colors.textDimmer, fontFamily: fonts.sans, fontSize: 11 },
  timeUnread: { color: colors.textStrong, fontFamily: fonts.sansSemi },
  badge: {
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.accentOn, fontFamily: fonts.sansBold, fontSize: 11 },

  empty: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    textAlign: 'center',
    marginTop: 48,
    fontSize: 14,
  },

  fab: {
    position: 'absolute',
    right: 20,
    bottom: 22,
    width: layout.fab,
    height: layout.fab,
    borderRadius: radius.fab,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 12 },
    elevation: 14,
  },
});
