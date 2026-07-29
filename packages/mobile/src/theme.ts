// Design tokens for the messenger redesign.
//
// The whole app is built from *two* surface colors plus an accent — depth comes from
// hairline borders and the accent, never from intermediate greys. Resist adding a third
// surface: if something needs to read as raised, put it on `shelf`; if it needs to read
// as recessed, put it on `bg`.

export const colors = {
  // The two surfaces.
  shelf: '#1B2121', // top shelf + every raised control (avatars, composer pill, their-bubbles, toast)
  bg: '#0F1515', // thread sheet, conversation body, insets on the shelf

  // Accent. The mint alternate (#7BE3C4) was the other candidate during design review.
  accent: '#9DB8FF',
  accentOn: '#0B1211', // text/icons *on* an accent fill

  // Text ramp, brightest first.
  text: '#EAF2EF',
  textBody: '#DFEAE7', // their-bubble message text
  textStrong: '#C4D1CE', // thread names (read state)
  textDim: '#7D8F8B', // previews, meta, quiet group names
  textDimmer: '#5F7570', // timestamps (read state), day divider
  textUnreadPreview: '#B3C3BF',
  textIcon: '#A9BAB6', // stroked interface icons at rest

  hairline: 'rgba(255,255,255,0.06)',
  hairlineSoft: 'rgba(255,255,255,0.05)',
  hairlineStrong: 'rgba(255,255,255,0.09)',

  sectionLabel: '#6D8580',

  // Swipe actions + failed sends.
  warnIcon: '#E0B980',
  warnLabel: '#C7A880',
  warnFill: 'rgba(224,185,128,0.14)',
  dangerIcon: '#E4795F',
  dangerLabel: '#DD9583',
  dangerFill: 'rgba(228,121,95,0.16)',
  failedBorder: 'rgba(228,121,95,0.45)',
  failedText: '#E8D6D1',
  readFill: 'rgba(157,184,255,0.15)',

  // Reaction bar press tint.
  pressTint: '#2C3636',
};

// Custom fonts don't synthesize weights on Android, so every weight is its own family.
// Always set `fontFamily` from here and leave `fontWeight` alone.
export const fonts = {
  groteskMedium: 'SpaceGrotesk_500Medium',
  grotesk: 'SpaceGrotesk_600SemiBold',
  sans: 'InstrumentSans_400Regular',
  sansMedium: 'InstrumentSans_500Medium',
  sansSemi: 'InstrumentSans_600SemiBold',
  sansBold: 'InstrumentSans_700Bold',
};

// The map handed to `useFonts`. Keys must match the family names above.
export const fontMap = {
  SpaceGrotesk_500Medium: require('@expo-google-fonts/space-grotesk/500Medium/SpaceGrotesk_500Medium.ttf'),
  SpaceGrotesk_600SemiBold: require('@expo-google-fonts/space-grotesk/600SemiBold/SpaceGrotesk_600SemiBold.ttf'),
  InstrumentSans_400Regular: require('@expo-google-fonts/instrument-sans/400Regular/InstrumentSans_400Regular.ttf'),
  InstrumentSans_500Medium: require('@expo-google-fonts/instrument-sans/500Medium/InstrumentSans_500Medium.ttf'),
  InstrumentSans_600SemiBold: require('@expo-google-fonts/instrument-sans/600SemiBold/InstrumentSans_600SemiBold.ttf'),
  InstrumentSans_700Bold: require('@expo-google-fonts/instrument-sans/700Bold/InstrumentSans_700Bold.ttf'),
};

export const radius = {
  sheet: 26, // top corners of both sheets
  row: 22, // pressed / sliding thread row
  tray: 18, // swipe action tray
  bubble: 20,
  bubbleTail: 7,
  quote: 8,
  fab: 20,
  input: 14,
  headerButton: 11,
  settingsButton: 12,
  full: 999,
};

// Thread row vertical padding. `regular` is the intended default and yields a 72px row.
export const density = {
  compact: 10,
  regular: 14,
  spacious: 18,
};

export const layout = {
  avatar: 44,
  conversationAvatar: 34,
  groupTile: 66,
  groupTileLabel: 70,
  fab: 56,
  composerControl: 42,
  swipeCell: 60,
  swipeTrayWidth: 180,
  // Open rest position: the 180 tray plus its 10px inset from the row's right edge.
  swipeOpen: -190,
  bubbleMaxWidth: 268,
  quoteMaxWidth: 232,
};

// Swipe physics. Velocity-seeded so a flick overshoots slightly and eases in — never a
// constant-speed tween.
export const spring = {
  stiffness: 240,
  damping: 25,
  mass: 1,
};
