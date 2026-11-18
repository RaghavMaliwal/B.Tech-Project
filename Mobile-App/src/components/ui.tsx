import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

export function Card({ title, children, style }: { title?: string; children: React.ReactNode; style?: object }) {
  return (
    <View style={[ui.card, style]}>
      {!!title && <Text style={ui.cardTitle}>{title}</Text>}
      {children}
    </View>
  );
}

type BtnProps = {
  label: string;
  onPress: () => void;
  kind?: 'dark' | 'green' | 'red' | 'ghost';
  disabled?: boolean;
  small?: boolean;
  style?: object;
};

export function Btn({ label, onPress, kind = 'dark', disabled, small, style }: BtnProps) {
  const bg = { dark: colors.text, green: colors.green, red: colors.red, ghost: colors.input }[kind];
  const fg = { dark: '#fff', green: '#0f172a', red: '#fff', ghost: colors.text }[kind];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        ui.btn, small && ui.btnSmall,
        { backgroundColor: bg }, kind === 'ghost' && { borderWidth: 1.5, borderColor: colors.border },
        (disabled || pressed) && { opacity: disabled ? 0.4 : 0.8 }, style
      ]}
    >
      <Text style={[ui.btnText, small && { fontSize: 14 }, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Msg({ text, kind }: { text: string; kind: 'ok' | 'err' | 'info' }) {
  const c = { ok: ['#dcfce7', '#166534'], err: ['#fee2e2', '#991b1b'], info: ['#e0f2fe', '#075985'] }[kind];
  return (
    <View style={[ui.msg, { backgroundColor: c[0] }]}>
      <Text style={{ color: c[1], fontWeight: '600', fontSize: 14 }}>{text}</Text>
    </View>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <View style={ui.seg}>
      {options.map((o) => (
        <Pressable key={o.id} onPress={() => onChange(o.id)} style={[ui.segBtn, value === o.id && ui.segBtnOn]}>
          <Text style={[ui.segText, value === o.id && { color: '#fff' }]} numberOfLines={1}>{o.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export const ui = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.card, padding: 14, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  btn: { borderRadius: radius.button, paddingVertical: 13, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 10, paddingHorizontal: 14 },
  btnText: { fontSize: 16, fontWeight: '800' },
  msg: { borderRadius: 10, padding: 11, marginVertical: 8 },
  seg: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  segBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center' },
  segBtnOn: { backgroundColor: colors.text, borderColor: colors.text },
  segText: { fontSize: 13, fontWeight: '800', color: colors.text },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 4 },
  hint: { fontSize: 13, color: colors.muted, lineHeight: 18, marginBottom: 10 }
});
