import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { colors } from '../theme';
import { DaemonConfig } from '../config';
import { useBackHandler } from '../useBackHandler';

type ScannerProps = { onScanned: (cfg: DaemonConfig) => void; onCancel: () => void };

// Resolve the scanner synchronously and defensively. QrScanScreen statically imports
// `expo-camera`, whose module evaluation throws ("Cannot find native module 'ExpoCamera'")
// in a dev build that predates the native module — so we require() it lazily (only when
// the user opens the scanner) inside a try/catch. require() is deliberate over
// React.lazy/import(): Metro's async dynamic import is unreliable here, and a synchronous
// require lets us catch the throw and degrade to manual entry instead of crashing.
function loadScanner(): React.ComponentType<ScannerProps> | null {
  try {
    return require('./QrScanScreen').default as React.ComponentType<ScannerProps>;
  } catch {
    return null;
  }
}

// Shown when the camera module isn't in this build (degraded path) — manual entry below
// still works.
function CameraUnavailable({ onCancel }: { onCancel: () => void }) {
  return (
    <View style={styles.center}>
      <Text style={styles.title}>Camera unavailable</Text>
      <Text style={styles.message}>
        QR scanning needs a newer build of the app. Rebuild the dev client (eas build) to enable it,
        or enter the daemon details manually.
      </Text>
      <TouchableOpacity style={styles.button} onPress={onCancel}>
        <Text style={styles.buttonText}>Back to manual entry</Text>
      </TouchableOpacity>
    </View>
  );
}

export function ConfigScreen({
  initial,
  onSave,
}: {
  initial: DaemonConfig | null;
  onSave: (cfg: DaemonConfig) => void;
}) {
  const [address, setAddress] = useState(initial?.address ?? '');
  const [token, setToken] = useState(initial?.token ?? '');
  const [scanning, setScanning] = useState(false);
  const valid = address.trim().length > 0 && token.trim().length > 0;

  // Back leaves the scanner the same way Cancel does. This screen is only ever reached
  // without a stored config, so there's nothing behind it — pressing back from the form
  // falls through to Android and exits.
  useBackHandler(() => {
    if (scanning) {
      setScanning(false);
      return true;
    }
    return false;
  });

  // A scanned QR prefills the fields and returns to this screen so the user can
  // review the address before tapping Connect.
  if (scanning) {
    const Scanner = loadScanner();
    if (!Scanner) {
      return <CameraUnavailable onCancel={() => setScanning(false)} />;
    }
    return (
      <Scanner
        onCancel={() => setScanning(false)}
        onScanned={(cfg) => {
          setAddress(cfg.address);
          setToken(cfg.token);
          setScanning(false);
        }}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Connect to daemon</Text>

      <TouchableOpacity style={styles.scanButton} onPress={() => setScanning(true)}>
        <Text style={styles.scanButtonText}>Scan QR code</Text>
      </TouchableOpacity>

      <View style={styles.dividerRow}>
        <View style={styles.dividerLine} />
        <Text style={styles.dividerText}>or enter manually</Text>
        <View style={styles.dividerLine} />
      </View>

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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  message: { color: colors.textDim, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 24 },
  scanButton: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  scanButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.hairlineStrong },
  dividerText: { color: colors.textDim, fontSize: 12, marginHorizontal: 12 },
  label: { color: colors.textDim, fontSize: 13, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.shelf,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.hairlineStrong,
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
