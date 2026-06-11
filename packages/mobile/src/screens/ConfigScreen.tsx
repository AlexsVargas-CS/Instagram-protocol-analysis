import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme';
import { DaemonConfig } from '../config';

export function ConfigScreen({
  initial,
  onSave,
}: {
  initial: DaemonConfig | null;
  onSave: (cfg: DaemonConfig) => void;
}) {
  const [address, setAddress] = useState(initial?.address ?? '');
  const [token, setToken] = useState(initial?.token ?? '');
  const valid = address.trim().length > 0 && token.trim().length > 0;

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Connect to daemon</Text>

      <Text style={styles.label}>Daemon address</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="192.168.1.50:8765"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />

      <Text style={styles.label}>Pairing token</Text>
      <TextInput
        style={styles.input}
        value={token}
        onChangeText={setToken}
        placeholder="IG_PAIRING_TOKEN value"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
      />

      <TouchableOpacity
        style={[styles.button, !valid && styles.buttonDisabled]}
        disabled={!valid}
        onPress={() => onSave({ address: address.trim(), token: token.trim() })}
      >
        <Text style={styles.buttonText}>Connect</Text>
      </TouchableOpacity>

      <Text style={styles.hint}>
        Enter the daemon's address (host:port on your LAN or tailnet) and the pairing token from the
        daemon's .env. The token is stored in the device's secure store.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 24, backgroundColor: colors.bg },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 24 },
  label: { color: colors.textDim, fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.panel,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  hint: { color: colors.textDim, fontSize: 12, marginTop: 18, lineHeight: 18 },
});
