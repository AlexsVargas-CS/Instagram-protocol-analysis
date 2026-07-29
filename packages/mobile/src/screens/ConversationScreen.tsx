import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, layout, radius } from '../theme';
import { Message, Thread, User } from '../protocol';
import { Monogram, TypingDots } from '../components';
import { formatTimestamp, threadName } from './ThreadsScreen';
import {
  ArrowUpIcon,
  ChevronLeftIcon,
  CloseIcon,
  DoubleCheckIcon,
  OverflowIcon,
  PlusIcon as AttachIcon,
  ReplyIcon,
  RetryIcon,
} from '../icons';

const REACTIONS = ['❤️', '😂', '👍', '😮', '🙏'];

function initial(name: string): string {
  const c = (name || '').replace(/[^a-z0-9]/gi, '').charAt(0);
  return c ? c.toUpperCase() : '?';
}

// 700ms linear rotation under the "Sending…" label.
function Spinner() {
  const r = useSharedValue(0);

  useEffect(() => {
    r.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.linear }), -1, false);
  }, [r]);

  const style = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value * 360}deg` }] }));

  return <Animated.View style={[styles.spinner, style]} />;
}

// Five reactions plus a Reply button, floating above the tapped bubble.
function ReactionBar({
  mine,
  current,
  onReact,
  onReply,
}: {
  mine: boolean;
  current?: string;
  onReact: (emoji: string) => void;
  onReply: () => void;
}) {
  const p = useSharedValue(0);

  useEffect(() => {
    p.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) });
  }, [p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: 6 * (1 - p.value) }, { scale: 0.94 + 0.06 * p.value }],
  }));

  return (
    <Animated.View style={[styles.reactionBar, mine ? styles.barRight : styles.barLeft, style]}>
      {REACTIONS.map((emoji) => (
        <Pressable
          key={emoji}
          style={({ pressed }) => [
            styles.reactionBtn,
            pressed && styles.reactionBtnPressed,
            current === emoji && styles.reactionBtnActive,
          ]}
          onPress={() => onReact(emoji)}
        >
          <Text style={styles.reactionEmoji}>{emoji}</Text>
        </Pressable>
      ))}
      <View style={styles.barDivider} />
      <Pressable style={styles.replyBtn} onPress={onReply}>
        <ReplyIcon size={14} />
        <Text style={styles.replyBtnText}>Reply</Text>
      </Pressable>
    </Animated.View>
  );
}

function Bubble({
  item,
  mine,
  active,
  onActivate,
  onReact,
  onReply,
  onRetry,
}: {
  item: Message;
  mine: boolean;
  active: boolean;
  onActivate: () => void;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onRetry: () => void;
}) {
  const failed = item.status === 'failed';
  const sending = item.status === 'sending';

  return (
    <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
      {active && (
        <ReactionBar mine={mine} current={item.reaction} onReact={onReact} onReply={onReply} />
      )}

      <Pressable onPress={onActivate} onLongPress={onActivate} delayLongPress={220}>
        <View
          style={[
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            failed && styles.bubbleFailed,
            sending && styles.bubbleSending,
          ]}
        >
          {item.replyTo && (
            <View style={[styles.quote, mine ? styles.quoteMine : styles.quoteTheirs]}>
              <Text style={[styles.quoteName, mine && styles.quoteTextMine]} numberOfLines={1}>
                {item.replyTo.name}
              </Text>
              <Text style={[styles.quoteBody, mine && styles.quoteTextMine]} numberOfLines={1}>
                {item.replyTo.text}
              </Text>
            </View>
          )}
          <Text
            style={[
              styles.msgText,
              mine ? styles.msgTextMine : styles.msgTextTheirs,
              failed && styles.msgTextFailed,
            ]}
          >
            {item.text}
          </Text>
        </View>
      </Pressable>

      {/* The chip rides the bubble's bottom edge, tucked 8px inward. */}
      {item.reaction && (
        <View style={[styles.reactionChip, mine ? styles.chipMine : styles.chipTheirs]}>
          <Text style={styles.reactionChipText}>{item.reaction}</Text>
        </View>
      )}

      {sending && (
        <View style={styles.statusRow}>
          <Spinner />
          <Text style={styles.statusText}>Sending…</Text>
        </View>
      )}

      {failed && (
        <Pressable style={styles.statusRow} onPress={onRetry}>
          <RetryIcon />
          <Text style={styles.failedText}>Not delivered · Retry</Text>
        </Pressable>
      )}

      {item.status === 'read' && (
        <View style={styles.statusRow}>
          <DoubleCheckIcon size={12} color={colors.textDimmer} />
          <Text style={styles.statusText}>Read {formatTimestamp(item.timestamp)}</Text>
        </View>
      )}
    </View>
  );
}

export function ConversationScreen({
  thread,
  messages,
  user,
  loading,
  onBack,
  onSend,
  onReact,
  onRetry,
}: {
  thread: Thread;
  messages: Message[];
  user: User | null;
  loading: boolean;
  onBack: () => void;
  onSend: (text: string, replyTo: { name: string; text: string } | null) => void;
  onReact: (itemId: string, emoji: string) => void;
  onRetry: (itemId: string) => void;
}) {
  const meUserId = user?.pk ?? null;
  const name = threadName(thread, meUserId);
  const [draft, setDraft] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<{ name: string; text: string } | null>(null);
  const listRef = useRef<FlatList<Message>>(null);

  // Open pinned to the newest message, and follow the tail as messages arrive.
  useEffect(() => {
    if (messages.length) listRef.current?.scrollToEnd({ animated: false });
  }, [thread.thread_id, messages.length]);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onSend(body, replyTo);
    setDraft('');
    setReplyTo(null);
  };

  const canSend = draft.trim().length > 0;
  const placeholder = thread.is_group
    ? `Message ${name}`
    : `Message @${thread.users?.find((u) => u.pk !== meUserId)?.username ?? name}`;

  const status = thread.typing ? 'typing' : thread.online ? 'Active now' : 'via daemon';

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <Pressable style={styles.headerBtn} onPress={onBack} hitSlop={8}>
          <ChevronLeftIcon />
        </Pressable>
        <Monogram letter={initial(name)} size={layout.conversationAvatar} fontSize={13} />
        <View style={styles.headerText}>
          <Text style={styles.headerName} numberOfLines={1}>
            {name}
          </Text>
          {thread.typing ? (
            <View style={styles.headerTyping}>
              <TypingDots size={4} />
              <Text style={styles.headerStatusTyping}>typing…</Text>
            </View>
          ) : (
            <Text style={styles.headerStatus}>{status}</Text>
          )}
        </View>
        <Pressable style={styles.headerBtn} hitSlop={8}>
          <OverflowIcon />
        </Pressable>
      </View>

      <View style={styles.body}>
        {loading && messages.length === 0 ? (
          <Text style={styles.empty}>Loading messages…</Text>
        ) : (
          <FlatList
            ref={listRef}
            data={messages}
            keyExtractor={(m, i) => m.itemId ?? `${m.timestamp}-${i}`}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={() => setActiveId(null)}
            ListHeaderComponent={
              <View style={styles.dayDivider}>
                <View style={styles.dayLine} />
                <Text style={styles.dayLabel}>Today</Text>
                <View style={styles.dayLine} />
              </View>
            }
            ListFooterComponent={
              thread.typing ? (
                <View style={[styles.msgRow, styles.msgRowTheirs]}>
                  <View style={[styles.bubble, styles.bubbleTheirs, styles.typingBubble]}>
                    <TypingDots size={6} color={colors.textDim} />
                  </View>
                </View>
              ) : null
            }
            renderItem={({ item, index }) => {
              const id = item.itemId ?? `${item.timestamp}-${index}`;
              return (
                <Bubble
                  item={item}
                  mine={meUserId != null && item.userId === meUserId}
                  active={activeId === id}
                  onActivate={() => setActiveId((cur) => (cur === id ? null : id))}
                  onReact={(emoji) => {
                    onReact(id, emoji);
                    setActiveId(null);
                  }}
                  onReply={() => {
                    setReplyTo({
                      name: item.userId === meUserId ? 'You' : name,
                      text: item.text,
                    });
                    setActiveId(null);
                  }}
                  onRetry={() => onRetry(id)}
                />
              );
            }}
          />
        )}
      </View>

      <View style={styles.composer}>
        {replyTo && (
          <View style={styles.replyStrip}>
            <ReplyIcon size={13} />
            <View style={styles.replyStripText}>
              <Text style={styles.replyStripName}>Replying to {replyTo.name}</Text>
              <Text style={styles.replyStripBody} numberOfLines={1}>
                {replyTo.text}
              </Text>
            </View>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={10}>
              <CloseIcon />
            </Pressable>
          </View>
        )}

        <View style={styles.composerRow}>
          <Pressable style={styles.attachBtn}>
            <AttachIcon />
          </Pressable>
          <TextInput
            style={styles.input}
            value={draft}
            onChangeText={setDraft}
            placeholder={placeholder}
            placeholderTextColor={colors.textDim}
            onSubmitEditing={submit}
            blurOnSubmit={false}
            returnKeyType="send"
          />
          <Pressable
            style={[styles.sendBtn, !canSend && styles.sendBtnDisabled]}
            onPress={submit}
            disabled={!canSend}
          >
            <ArrowUpIcon />
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.shelf },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 2,
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerBtn: {
    width: 34,
    height: 34,
    borderRadius: radius.headerButton,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: { flex: 1, gap: 2 },
  headerName: { color: colors.text, fontFamily: fonts.grotesk, fontSize: 16 },
  headerStatus: { color: colors.textDim, fontFamily: fonts.sans, fontSize: 11.5 },
  headerTyping: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerStatusTyping: { color: colors.accent, fontFamily: fonts.sansSemi, fontSize: 11.5 },

  body: {
    flex: 1,
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    overflow: 'hidden',
  },
  listContent: { paddingTop: 18, paddingHorizontal: 16, paddingBottom: 8 },

  dayDivider: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  dayLine: { flex: 1, height: 1, backgroundColor: colors.hairline },
  dayLabel: {
    color: colors.textDimmer,
    fontFamily: fonts.sansBold,
    fontSize: 10,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
  },

  msgRow: { marginTop: 8 },
  msgRowMine: { alignItems: 'flex-end' },
  msgRowTheirs: { alignItems: 'flex-start' },

  bubble: {
    maxWidth: layout.bubbleMaxWidth,
    paddingVertical: 11,
    paddingHorizontal: 15,
  },
  bubbleMine: {
    backgroundColor: colors.accent,
    borderTopLeftRadius: radius.bubble,
    borderTopRightRadius: radius.bubble,
    borderBottomRightRadius: radius.bubbleTail,
    borderBottomLeftRadius: radius.bubble,
  },
  bubbleTheirs: {
    backgroundColor: colors.shelf,
    borderWidth: 1,
    borderColor: colors.hairlineSoft,
    borderTopLeftRadius: radius.bubble,
    borderTopRightRadius: radius.bubble,
    borderBottomRightRadius: radius.bubble,
    borderBottomLeftRadius: radius.bubbleTail,
  },
  bubbleSending: { opacity: 0.6 },
  bubbleFailed: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.failedBorder,
  },

  msgText: { fontSize: 14.5, lineHeight: 20 },
  msgTextMine: { color: colors.accentOn, fontFamily: fonts.sansMedium },
  msgTextTheirs: { color: colors.textBody, fontFamily: fonts.sans },
  msgTextFailed: { color: colors.failedText },

  quote: {
    borderLeftWidth: 2.5,
    borderRadius: radius.quote,
    paddingVertical: 6,
    paddingHorizontal: 9,
    marginBottom: 7,
    maxWidth: layout.quoteMaxWidth,
  },
  quoteTheirs: { borderLeftColor: colors.accent, backgroundColor: 'rgba(255,255,255,0.05)' },
  quoteMine: { borderLeftColor: 'rgba(11,18,17,0.4)', backgroundColor: 'rgba(11,18,17,0.12)' },
  quoteName: { color: colors.text, fontFamily: fonts.sansBold, fontSize: 11 },
  quoteBody: { color: colors.textDim, fontFamily: fonts.sans, fontSize: 12.5, lineHeight: 17 },
  quoteTextMine: { color: colors.accentOn },

  reactionChip: {
    marginTop: -7,
    backgroundColor: colors.shelf,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  chipMine: { marginRight: 8 },
  chipTheirs: { marginLeft: 8 },
  reactionChipText: { fontSize: 12, lineHeight: 16 },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 4 },
  statusText: { color: colors.textDimmer, fontFamily: fonts.sans, fontSize: 11 },
  failedText: { color: colors.dangerIcon, fontFamily: fonts.sansSemi, fontSize: 11.5 },
  spinner: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.textDimmer,
    borderTopColor: 'transparent',
  },

  typingBubble: { paddingVertical: 13, paddingHorizontal: 16 },

  reactionBar: {
    position: 'absolute',
    bottom: '100%',
    marginBottom: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: colors.shelf,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.full,
    paddingHorizontal: 6,
    paddingVertical: 5,
    zIndex: 10,
    shadowColor: '#000',
    shadowOpacity: 0.55,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  barLeft: { left: 0 },
  barRight: { right: 0 },
  reactionBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reactionBtnPressed: { backgroundColor: colors.pressTint, transform: [{ scale: 1.12 }] },
  reactionBtnActive: { backgroundColor: colors.pressTint },
  reactionEmoji: { fontSize: 17 },
  barDivider: {
    width: 1,
    height: 18,
    marginHorizontal: 4,
    backgroundColor: colors.hairlineStrong,
  },
  replyBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 8 },
  replyBtnText: { color: colors.accent, fontFamily: fonts.sansSemi, fontSize: 12 },

  empty: {
    color: colors.textDim,
    fontFamily: fonts.sans,
    textAlign: 'center',
    marginTop: 40,
    fontSize: 14,
  },

  composer: { backgroundColor: colors.bg, paddingTop: 8, paddingHorizontal: 12, paddingBottom: 14 },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  replyStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 8,
    paddingVertical: 7,
    paddingHorizontal: 11,
    backgroundColor: colors.shelf,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.input,
  },
  replyStripText: { flex: 1 },
  replyStripName: { color: colors.accent, fontFamily: fonts.sansBold, fontSize: 11 },
  replyStripBody: { color: colors.textDim, fontFamily: fonts.sans, fontSize: 12.5 },

  attachBtn: {
    width: layout.composerControl,
    height: layout.composerControl,
    borderRadius: radius.input,
    backgroundColor: colors.shelf,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    height: layout.composerControl,
    backgroundColor: colors.shelf,
    borderWidth: 1,
    borderColor: colors.hairline,
    borderRadius: radius.input,
    paddingHorizontal: 16,
    color: colors.text,
    fontFamily: fonts.sans,
    fontSize: 14.5,
  },
  sendBtn: {
    width: layout.composerControl,
    height: layout.composerControl,
    borderRadius: radius.input,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnDisabled: { opacity: 0.35 },
});
