import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { colors, fill, radius } from '../theme';
import { clock } from '../utils';

type Props = {
  label: string;
  color: string;
  values: number[];
  times: number[];          // epoch ms, same length as values
  decimals?: number;
  threshold?: number;       // optional dashed limit line (drawn only if inside the range)
  height?: number;
};

const PAD = { top: 34, right: 14, bottom: 30, left: 46 };

export function Chart({ label, color, values, times, decimals = 1, threshold, height = 200 }: Props) {
  const [w, setW] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setW(Math.round(e.nativeEvent.layout.width));

  const n = values.length;
  const gW = Math.max(10, w - PAD.left - PAD.right);
  const gH = height - PAD.top - PAD.bottom;

  let min = n ? Math.min(...values) : 0;
  let max = n ? Math.max(...values) : 1;
  if (max - min < 0.2) {
    const mid = (max + min) / 2;
    min = mid - 0.5;
    max = mid + 0.5;
  } else {
    const p = (max - min) * 0.12;
    min -= p;
    max += p;
  }
  const xAt = (i: number) => (n === 1 ? PAD.left + gW / 2 : PAD.left + (gW * i) / (n - 1));
  const yAt = (v: number) => PAD.top + gH - ((v - min) / (max - min)) * gH;
  const clampY = (y: number) => Math.max(PAD.top, Math.min(PAD.top + gH, y));

  // smooth curve (Catmull-Rom -> cubic Bezier)
  let path = '';
  if (n >= 2) {
    const pts = values.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
    path = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
      path += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
  }

  const ticks = [0, 1, 2, 3, 4].map((i) => min + ((max - min) * i) / 4);
  const xLabelIdx = n === 0 ? [] : n === 1 ? [0] : n < 4 ? [0, n - 1] : [0, Math.floor((n - 1) / 2), n - 1];
  const showThr = threshold !== undefined && threshold >= min && threshold <= max;

  return (
    <View style={styles.wrap} onLayout={onLayout}>
      {w > 0 && (
        <Svg width={w} height={height}>
          {/* legend */}
          <Rect x={PAD.left} y={11} width={11} height={11} rx={2} fill={color} />
          <SvgText x={PAD.left + 18} y={21} fontSize={14} fontWeight="bold" fill={colors.text}>{label}</SvgText>
          {n > 0 && (
            <SvgText x={w - PAD.right} y={21} fontSize={14} fontWeight="bold" fill={color} textAnchor="end">
              {values[n - 1].toFixed(decimals)}
            </SvgText>
          )}

          {/* grid + y labels */}
          {ticks.map((t, i) => (
            <G key={i}>
              <Line x1={PAD.left} x2={PAD.left + gW} y1={yAt(t)} y2={yAt(t)} stroke="#e2e8f0" strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={yAt(t) + 4} fontSize={11} fill={colors.muted} textAnchor="end">{t.toFixed(decimals)}</SvgText>
            </G>
          ))}
          <Line x1={PAD.left} x2={PAD.left} y1={PAD.top} y2={PAD.top + gH} stroke="#94a3b8" strokeWidth={1.2} />
          <Line x1={PAD.left} x2={PAD.left + gW} y1={PAD.top + gH} y2={PAD.top + gH} stroke="#94a3b8" strokeWidth={1.2} />

          {showThr && (
            <Line x1={PAD.left} x2={PAD.left + gW} y1={yAt(threshold as number)} y2={yAt(threshold as number)} stroke={colors.red} strokeWidth={1.2} strokeDasharray="5 4" />
          )}

          {/* data */}
          {n >= 2 && <Path d={path} stroke={color} strokeWidth={2.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
          {values.map((v, i) => (
            <Circle key={i} cx={xAt(i)} cy={yAt(v)} r={i === n - 1 ? 4.5 : 3} fill={color} />
          ))}

          {/* x labels */}
          {xLabelIdx.map((i, k) => (
            <SvgText
              key={i}
              x={xAt(i)}
              y={height - 9}
              fontSize={11}
              fill={colors.muted}
              textAnchor={k === 0 && xLabelIdx.length > 1 ? 'start' : k === xLabelIdx.length - 1 && xLabelIdx.length > 1 ? 'end' : 'middle'}
            >
              {clock(times[i])}
            </SvgText>
          ))}
        </Svg>
      )}
      {n === 0 && (
        <View style={styles.empty} pointerEvents="none">
          <Text style={styles.emptyText}>Waiting for data&hellip;</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: colors.card, borderRadius: radius.card, overflow: 'hidden', width: '100%' },
  empty: { ...fill, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: colors.muted, fontSize: 14 }
});
