import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius } from '../theme';
import type { PatientDetails } from '../types';
import { CloseIcon } from './Icons';

export const EMPTY_PATIENT: PatientDetails = { name: '', age: '', height: '', weight: '', diagnosis: '', bed: '' };

type Props = {
  visible: boolean;
  zoneTitle: string;
  initial: PatientDetails;
  busy: boolean;
  onCancel: () => void;
  onSave: (p: PatientDetails) => void;
  onShare: (p: PatientDetails) => void;
};

const FIELDS: { key: keyof PatientDetails; label: string; keyboard?: 'default' | 'numeric' }[] = [
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age', keyboard: 'numeric' },
  { key: 'height', label: 'Height' },
  { key: 'weight', label: 'Weight' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'bed', label: 'Bed No' }
];

/** Bottom sheet asking for patient details before the CSV is exported. Every field is optional. */
export function PatientSheet({ visible, zoneTitle, initial, busy, onCancel, onSave, onShare }: Props) {
  const [p, setP] = useState<PatientDetails>(initial);

  // re-seed the form every time the sheet is opened
  const [wasVisible, setWasVisible] = useState(false);
  if (visible && !wasVisible) { setWasVisible(true); setP(initial); }
  if (!visible && wasVisible) setWasVisible(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.backdrop} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} />
        <View style={styles.sheet}>
          <View style={styles.head}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Patient details</Text>
              <Text style={styles.sub}>{zoneTitle} {'\u00b7'} all fields are optional</Text>
            </View>
            <Pressable onPress={onCancel} hitSlop={12} style={styles.close}><CloseIcon /></Pressable>
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 360 }}>
            {FIELDS.map((f) => (
              <View key={f.key} style={{ marginBottom: 10 }}>
                <Text style={styles.label}>{f.label}</Text>
                <TextInput
                  style={styles.input}
                  value={p[f.key]}
                  onChangeText={(t) => setP((old) => ({ ...old, [f.key]: t }))}
                  placeholder={f.label}
                  placeholderTextColor="#94a3b8"
                  keyboardType={f.keyboard ?? 'default'}
                  autoCorrect={false}
                />
              </View>
            ))}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => onShare(p)}>
              <Text style={styles.btnGhostText}>Share{'\u2026'}</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnGreen, busy && { opacity: 0.5 }]} disabled={busy} onPress={() => onSave(p)}>
              <Text style={styles.btnGreenText}>Save to device</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.card, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, paddingBottom: 24 },
  head: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  title: { fontSize: 20, fontWeight: '800', color: colors.text },
  sub: { fontSize: 13, color: colors.muted, marginTop: 2 },
  close: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.input, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 4 },
  input: { backgroundColor: colors.input, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: colors.text },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  btn: { flex: 1, borderRadius: radius.button, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: colors.input, borderWidth: 1.5, borderColor: colors.border },
  btnGhostText: { color: colors.text, fontWeight: '800', fontSize: 16 },
  btnGreen: { backgroundColor: colors.green },
  btnGreenText: { color: '#0f172a', fontWeight: '800', fontSize: 16 }
});
