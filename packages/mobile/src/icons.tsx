// Interface icons, ported 1:1 from the design prototype's inline SVGs.
//
// Every icon is a stroked 24×24 path at 1.7–2.3 stroke width with round caps. Sizes and
// stroke widths below are the prototype's — pass `size`/`color` to retint, but leave the
// geometry alone so the set stays consistent. Emoji are used *only* as message reactions,
// never here.

import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colors } from './theme';

type IconProps = {
  size?: number;
  color?: string;
  strokeWidth?: number;
};

const VB = '0 0 24 24';

export function GearIcon({ size = 17, color = colors.textIcon, strokeWidth = 1.7 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Circle
        cx={12}
        cy={12}
        r={3.1}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path
        d="M12 3.4v2.2M12 18.4v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function DoubleCheckIcon({
  size = 15,
  color = colors.textDimmer,
  strokeWidth = 2.1,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M3 12.6l4.2 4.2L14 9.4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11.2 15.6l1.6 1.2L21 9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Full bell-off with clapper — the swipe action's MUTE icon.
export function BellOffIcon({ size = 17, color = colors.warnIcon, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M6 8.5a6 6 0 0112 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 19a2.2 2.2 0 004 0"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M3.5 3.5l17 17"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Clapper-less variant for the tiny glyph beside a muted thread's name.
export function BellOffGlyph({ size = 12, color = colors.textDimmer, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M6 8.5a6 6 0 0112 0c0 5 2 6.5 2 6.5H4s2-1.5 2-6.5z"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path d="M3.5 3.5l17 17" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function ArchiveIcon({
  size = 17,
  color = colors.dangerIcon,
  strokeWidth = 1.8,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Rect
        x={3.2}
        y={4.5}
        width={17.6}
        height={4.4}
        rx={1.4}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5 9v9.2a1.4 1.4 0 001.4 1.4h11.2A1.4 1.4 0 0019 18.2V9"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M10 13h4"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function MagnifierIcon({
  size = 23,
  color = colors.accentOn,
  strokeWidth = 2.3,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Circle
        cx={10.8}
        cy={10.8}
        r={6.4}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <Path d="M15.6 15.6L21 21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

export function ChevronLeftIcon({
  size = 18,
  color = colors.textIcon,
  strokeWidth = 2.2,
}: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M14.5 5.5L8 12l6.5 6.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function OverflowIcon({ size = 18, color = colors.textIcon }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill={color}>
      <Circle cx={12} cy={5.4} r={1.7} />
      <Circle cx={12} cy={12} r={1.7} />
      <Circle cx={12} cy={18.6} r={1.7} />
    </Svg>
  );
}

export function ReplyIcon({ size = 14, color = colors.accent, strokeWidth = 2.1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M9 7L4 12l5 5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M4 12h9a6 6 0 016 6v1"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function RetryIcon({ size = 13, color = colors.dangerIcon, strokeWidth = 2.1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M20 5.5v5h-5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M19.4 10.5A8 8 0 104.6 15"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export function CloseIcon({ size = 11, color = colors.textIcon, strokeWidth = 2.6 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M5.5 5.5l13 13M18.5 5.5l-13 13"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function PlusIcon({ size = 18, color = colors.textIcon, strokeWidth = 2.1 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M12 5.5v13M5.5 12h13"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function ArrowUpIcon({ size = 19, color = colors.accentOn, strokeWidth = 2.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox={VB} fill="none">
      <Path
        d="M12 19.5V5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.5 11.5L12 5l6.5 6.5"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}
