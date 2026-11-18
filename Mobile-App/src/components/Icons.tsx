import React from 'react';
import Svg, { Defs, Mask, Path, Rect } from 'react-native-svg';

type P = { size?: number; color?: string };

const WRENCH =
  'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z';

/** Spanner + screwdriver (diagnostics) */
export function ToolsIcon({ size = 24, color = '#1e293b' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <Defs>
        <Mask id="cut" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <Rect width="24" height="24" fill="#fff" />
          <Path d="M5 5 L19.5 19.5" stroke="#000" strokeWidth={5.2} strokeLinecap="round" />
        </Mask>
      </Defs>
      <Path mask="url(#cut)" d={WRENCH} />
      <Path d="M3.4 3.4 L12.6 12.6" />
      <Path d="M12.2 12.2 L19.6 19.6" strokeWidth={4.6} />
    </Svg>
  );
}

export function BackIcon({ size = 24, color = '#1e293b' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M15 5 L8 12 L15 19" />
    </Svg>
  );
}

export function PlayIcon({ size = 20, color = '#1e293b' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M7 4.5 L19 12 L7 19.5 Z" />
    </Svg>
  );
}

export function PauseIcon({ size = 20, color = '#1e293b' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x="6" y="5" width="4" height="14" rx="1" />
      <Rect x="14" y="5" width="4" height="14" rx="1" />
    </Svg>
  );
}

export function StopIcon({ size = 20, color = '#1e293b' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Rect x="6" y="6" width="12" height="12" rx="1.5" />
    </Svg>
  );
}

export function DownloadIcon({ size = 22, color = '#0f172a' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 4 V15" />
      <Path d="M7 10.5 L12 15.5 L17 10.5" />
      <Path d="M5 19.5 H19" />
    </Svg>
  );
}

export function GearIcon({ size = 20, color = '#64748b' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 15.2 a3.2 3.2 0 1 0 0 -6.4 a3.2 3.2 0 0 0 0 6.4 z" />
      <Path d="M19.4 13.5 a1.6 1.6 0 0 0 .3 1.8 l.1 .1 a2 2 0 1 1 -2.8 2.8 l-.1 -.1 a1.6 1.6 0 0 0 -1.8 -.3 a1.6 1.6 0 0 0 -1 1.5 V19 a2 2 0 1 1 -4 0 v-.1 a1.6 1.6 0 0 0 -1 -1.5 a1.6 1.6 0 0 0 -1.8 .3 l-.1 .1 a2 2 0 1 1 -2.8 -2.8 l.1 -.1 a1.6 1.6 0 0 0 .3 -1.8 a1.6 1.6 0 0 0 -1.5 -1 H5 a2 2 0 1 1 0 -4 h.1 a1.6 1.6 0 0 0 1.5 -1 a1.6 1.6 0 0 0 -.3 -1.8 l-.1 -.1 a2 2 0 1 1 2.8 -2.8 l.1 .1 a1.6 1.6 0 0 0 1.8 .3 h0 a1.6 1.6 0 0 0 1 -1.5 V5 a2 2 0 1 1 4 0 v.1 a1.6 1.6 0 0 0 1 1.5 h0 a1.6 1.6 0 0 0 1.8 -.3 l.1 -.1 a2 2 0 1 1 2.8 2.8 l-.1 .1 a1.6 1.6 0 0 0 -.3 1.8 v0 a1.6 1.6 0 0 0 1.5 1 H19 a2 2 0 1 1 0 4 h-.1 a1.6 1.6 0 0 0 -1.5 1 z" />
    </Svg>
  );
}

export function CloseIcon({ size = 20, color = '#1e293b' }: P) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Path d="M6 6 L18 18" />
      <Path d="M18 6 L6 18" />
    </Svg>
  );
}
