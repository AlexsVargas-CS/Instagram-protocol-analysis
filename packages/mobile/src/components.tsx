// Small presentational pieces shared by the inbox and the conversation.

import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { colors, fonts, layout, radius } from './theme';

// One dot of the typing indicator: a 1.15s loop that rises 3px and brightens from 45%
// to full, the three staggered 140ms apart.
function TypingDot({ delay, size, color }: { delay: number; size: number; color: string }) {
  const t = useSharedValue(0);

  useEffect(() => {
    t.value = withDelay(
      delay,
      withRepeat(withTiming(1, { duration: 1150, easing: Easing.linear }), -1, false),
    );
  }, [delay, t]);

  const style = useAnimatedStyle(() => {
    // Triangle wave — rise over the first half of the loop, fall over the second.
    const k = t.value < 0.5 ? t.value * 2 : (1 - t.value) * 2;
    return { transform: [{ translateY: -3 * k }], opacity: 0.45 + 0.55 * k };
  });

  return (
    <Animated.View
      style={[{ width: size, height: size, borderRadius: size / 2, backgroundColor: color }, style]}
    />
  );
}

export function TypingDots({ size = 4, color = colors.accent }: { size?: number; color?: string }) {
  return (
    <View style={[styles.dots, { gap: size * 0.9 }]}>
      <TypingDot delay={0} size={size} color={color} />
      <TypingDot delay={140} size={size} color={color} />
      <TypingDot delay={280} size={size} color={color} />
    </View>
  );
}

// Circular monogram. Unread flips the border and letter to the accent — the only
// difference between the two states.
export function Monogram({
  letter,
  size = layout.avatar,
  unread = false,
  fontSize,
}: {
  letter: string;
  size?: number;
  unread?: boolean;
  fontSize?: number;
}) {
  return (
    <View
      style={[
        styles.monogram,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderColor: unread ? colors.accent : colors.hairlineStrong,
        },
      ]}
    >
      <Text
        style={[
          styles.monogramText,
          {
            fontSize: fontSize ?? Math.round(size * 0.386),
            color: unread ? colors.accent : colors.textStrong,
          },
        ]}
      >
        {letter}
      </Text>
    </View>
  );
}

// Transient confirmation pill. Non-interactive; the caller clears it after 1.8s.
export function Toast({ message }: { message: string | null }) {
  const o = useSharedValue(0);

  useEffect(() => {
    o.value = withTiming(message ? 1 : 0, { duration: 160 });
  }, [message, o]);

  const style = useAnimatedStyle(() => ({ opacity: o.value }));

  if (!message) return null;
  return (
    <Animated.View style={[styles.toast, style]} pointerEvents="none">
      <Text style={styles.toastText}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dots: { flexDirection: 'row', alignItems: 'flex-end' },

  monogram: {
    backgroundColor: colors.shelf,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monogramText: { fontFamily: fonts.grotesk },

  toast: {
    position: 'absolute',
    bottom: 26,
    alignSelf: 'center',
    backgroundColor: colors.shelf,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    paddingVertical: 9,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  toastText: { color: colors.text, fontFamily: fonts.sansMedium, fontSize: 12.5 },
});
