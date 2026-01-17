# Environment Setup Guide

This guide documents how to set up a traffic interception environment for analyzing Instagram's private API.

## Overview

We use an Android emulator with mitmproxy to capture HTTPS traffic between the Instagram app and its servers. This requires:
1. Android Studio emulator (NOT a physical device)
2. mitmproxy for traffic interception
3. A patched Instagram APK (to bypass SSL pinning)

## Prerequisites

### Software Required
- **Windows 10/11** (or Linux/macOS with adjustments)
- **Android Studio** with SDK and emulator
- **mitmproxy** (`pip install mitmproxy`)
- **OpenSSL** (for certificate conversion)

### Important Notes
- ⚠️ Use a **test account**, never your primary Instagram account
- ⚠️ Accounts may get suspended due to unusual traffic patterns
- ⚠️ This setup is for educational/research purposes only

---

## Step 1: Android Emulator Setup

### 1.1 Create Android Virtual Device (AVD)

Open Android Studio → Tools → Device Manager → Create Device

**Recommended Configuration:**
| Setting | Value | Reason |
|---------|-------|--------|
| Device | Pixel 5 | Good balance of features |
| System Image | Android 11 (API 30) | Easier cert installation than Android 14+ |
| Image Type | **Google Play** | Instagram requires Google Play Services |
| RAM | 2048 MB+ | Instagram is resource-heavy |

> **Why not AOSP?** Instagram crashes on AOSP images because it requires Google Play Services files (`gql_sampling_config`, etc.)

### 1.2 Add ADB to System PATH

ADB (Android Debug Bridge) is needed for certificate installation.

**Windows (PowerShell):**
```powershell
# Temporary (current session only)
$env:PATH += ";C:\Users\<YourUsername>\AppData\Local\Android\Sdk\platform-tools"

# Or navigate to the directory and use .\adb.exe
cd C:\Users\<YourUsername>\AppData\Local\Android\Sdk\platform-tools
.\adb.exe devices
```

**Permanent PATH Addition:**
1. Search "Environment Variables" in Windows
2. Edit User PATH variable
3. Add: `C:\Users\<YourUsername>\AppData\Local\Android\Sdk\platform-tools`
4. Restart terminal

### 1.3 Start Emulator with Writable System

```bash
# List available AVDs
emulator -list-avds

# Start with writable system (required for cert installation)
emulator -avd <your-avd-name> -writable-system
```

---

## Step 2: mitmproxy Certificate Installation

### 2.1 Start mitmproxy

```bash
# Terminal UI
mitmproxy

# OR Web interface (recommended for beginners)
mitmweb
```

mitmproxy will generate certificates on first run at:
- **Windows:** `C:\Users\<Username>\.mitmproxy\`
- **Linux/Mac:** `~/.mitmproxy/`

### 2.2 Convert Certificate to Android Format

Android requires certificates in a specific format with a hash-based filename.

```bash
# Navigate to mitmproxy cert directory
cd ~/.mitmproxy

# Get the certificate hash
openssl x509 -inform PEM -subject_hash_old -in mitmproxy-ca-cert.pem | head -1
# Output example: c8750f0d

# Copy and rename certificate
cp mitmproxy-ca-cert.pem c8750f0d.0
```

### 2.3 Install as System Certificate

```bash
# Ensure emulator is running with -writable-system flag

# Root the device and remount system partition
adb root
adb remount

# Push certificate to system CA store
adb push c8750f0d.0 /system/etc/security/cacerts/

# Set correct permissions
adb shell chmod 644 /system/etc/security/cacerts/c8750f0d.0

# Reboot to apply changes
adb reboot
```

### 2.4 Verify Certificate Installation

On the emulator:
1. Go to **Settings** → **Security** → **Encryption & credentials**
2. Tap **Trusted credentials** → **System** tab
3. Look for **mitmproxy** in the list

---

## Step 3: Proxy Configuration

### 3.1 Configure Emulator WiFi Proxy

On the emulator:
1. **Settings** → **Network & Internet** → **Wi-Fi**
2. Long-press **AndroidWifi** → **Modify network**
3. Expand **Advanced options**
4. Set Proxy to **Manual**
   - **Hostname:** `10.0.2.2` (special address for host machine)
   - **Port:** `8080`
5. Save

### 3.2 Verify Proxy Connection

1. Open Chrome on emulator
2. Visit `http://mitm.it`
3. You should see the mitmproxy certificate page
4. In mitmproxy terminal, you should see requests appearing

---

## Step 4: Instagram Installation (SSL Pinning Bypass)

### 4.1 Why We Need a Patched APK

The official Instagram app uses **SSL certificate pinning**, which means it only trusts specific certificates, not our mitmproxy CA. We need a modified APK with pinning disabled.

### 4.2 Download Patched APK

**Source:** [Eltion/Instagram-SSL-Pinning-Bypass](https://github.com/ArmynC/Instagram-SSL-Pinning-Bypass/releases)

Download the appropriate version (ARM64 for most emulators with Google Play images).

### 4.3 Install APK

```bash
# Install via ADB
adb install Instagram-v<version>-SSL-Bypass.apk

# Or drag-and-drop the APK onto the emulator window
```

### 4.4 Login and Test

1. Open Instagram on emulator
2. Login with your **test account**
3. Check mitmproxy - you should see HTTPS requests being captured

---

## Step 5: Traffic Capture

### 5.1 Start Capture Session

```bash
# Start mitmproxy with output file
mitmproxy -w instagram_capture.flow

# Or with mitmweb
mitmweb -w instagram_capture.flow
```

### 5.2 Generate Traffic

On the emulator, perform the actions you want to analyze:
- Send a direct message
- View your inbox
- Like a post
- etc.

### 5.3 Export Captured Data

```bash
# View saved flows
mitmproxy -r instagram_capture.flow

# Export to readable format
mitmdump -r instagram_capture.flow --flow-detail 3 > instagram_traffic.txt
```

### 5.4 mitmproxy Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Enter` | View request details |
| `Tab` | Switch request/response |
| `q` | Back / quit |
| `w` | Write flows to file |
| `e` | Export request |
| `?` | Help |

---

## Troubleshooting

### Instagram Crashes on Launch
- **Cause:** Missing Google Play Services
- **Fix:** Use Google Play system image, not AOSP

### Certificate Not Trusted
- **Cause:** Certificate not in system store
- **Fix:** Ensure emulator started with `-writable-system` flag

### No Traffic in mitmproxy
- **Cause:** Proxy not configured correctly
- **Fix:** Verify proxy settings point to `10.0.2.2:8080`

### SSL Pinning Still Active
- **Cause:** Using official Instagram APK
- **Fix:** Install the patched APK from the bypass repository

### Account Suspended
- **Cause:** Instagram detected unusual traffic patterns
- **Fix:** Use a fresh emulator, different network, new test account

---

## Next Steps

Once you have traffic captured:
1. Analyze the endpoints in [api-endpoints.md](api-endpoints.md)
2. Study the headers in [headers.md](headers.md)
3. Understand authentication in [authentication.md](authentication.md)
