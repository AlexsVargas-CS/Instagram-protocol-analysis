import React, { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { colors } from '../theme';
import { DaemonConfig, parsePairingPayload } from '../config';

// Full-screen camera that scans the daemon pairing QR. On a valid scan it hands the
// parsed config back to the caller; an unrecognized QR shows an inline hint and lets
// the user keep scanning. Camera permission is requested lazily on mount.
//
// Default export + the top-level `expo-camera` import are deliberate: ConfigScreen
// require()s this module only when the user opens the scanner, inside a try/catch, so
// the native camera module is touched lazily. A dev build without expo-camera therefore
// runs the rest of the app fine — the require throws and ConfigScreen shows a fallback.
export default function QrScanScreen({
  onScanned,
  onCancel,
}: {
  onScanned: (cfg: DaemonConfig) => void;
  onCancel: () => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  // The camera fires onBarcodeScanned repeatedly; latch so we parse exactly once.
  const handledRef = useRef(false);

  const handleScan = (data: string) => {
    if (handledRef.current) return;
    const cfg = parsePairingPayload(data);
    if (!cfg) {
      setError('That QR code isn’t a daemon pairing code. Try again.');
      return;
    }
    handledRef.current = true;
    onScanned(cfg);
  };

  // Permission still loading.
  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Checking camera permission…</Text>
      </View>
    );
  }

  // Permission not granted yet.
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Camera access needed</Text>
        <Text style={styles.message}>
          {permission.canAskAgain
            ? 'Allow camera access to scan the daemon pairing QR code.'
            : 'Camera access is blocked. Enable it for this app in system settings, or enter the daemon details manually.'}
        </Text>
        {permission.canAskAgain && (
          <TouchableOpacity style={styles.button} onPress={requestPermission}>
            <Text style={styles.buttonText}>Grant camera access</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.linkButton} onPress={onCancel}>
          <Text style={styles.linkText}>Back to manual entry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={(result) => handleScan(result.data)}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.scanHint}>Point the camera at the daemon QR code</Text>
        <View style={styles.reticle} />
        {error ? <Text style={styles.error}>{error}</Text> : <View style={styles.errorSpacer} />}
        <TouchableOpacity style={styles.cancelButton} onPress={onCancel}>
          <Text style={styles.cancelText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: colors.bg,
  },
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 12 },
  message: { color: colors.textDim, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  scanHint: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 24,
    textShadowColor: '#000',
    textShadowRadius: 6,
  },
  reticle: {
    width: 240,
    height: 240,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  error: {
    color: '#fff',
    backgroundColor: colors.accent,
    fontSize: 14,
    fontWeight: '600',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 24,
    overflow: 'hidden',
  },
  errorSpacer: { height: 24 + 16 + 14 },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelButton: {
    marginTop: 32,
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  cancelText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  linkButton: { marginTop: 20, padding: 8 },
  linkText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
});
