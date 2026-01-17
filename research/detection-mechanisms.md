# Instagram Anti-Bot Detection Mechanisms

Research notes on how Instagram detects and blocks automated/unofficial clients.

## Overview

Instagram employs multiple layers of detection to identify non-authentic app usage:

1. **Device Fingerprinting** - Hardware/software identification
2. **Behavioral Analysis** - Usage pattern detection
3. **Network Analysis** - IP/connection profiling
4. **Request Validation** - Header/signature verification
5. **Rate Limiting** - Request frequency limits

---

## Device Fingerprinting

### What Instagram Collects

| Signal | Description | Detection Use |
|--------|-------------|---------------|
| Device ID | Unique device identifier | Link multiple accounts |
| Android ID | System-level ID | Detect emulators |
| Hardware specs | Screen, CPU, memory | Identify spoofing |
| System uptime | Time since boot | Detect reset patterns |
| GL Renderer | GPU information | Detect emulators |
| Build fingerprint | ROM information | Detect custom ROMs |
| Installed apps | Package list | Bot detection |
| Sensors | Accelerometer, gyro | Emulator detection |

### Emulator Detection Signals

Instagram specifically checks for:
```
- ro.hardware = "goldfish" or "ranchu"
- ro.product.model contains "sdk" or "emulator"
- GLES Renderer = "Android Emulator"
- /dev/qemu_pipe exists
- Telephony data missing
- Battery always charging
- No SIM card
```

### How instagram-private-api Handles This

They generate consistent, realistic device profiles:
```typescript
generateDevice(seed: string) {
  // Use seed to generate deterministic but realistic values
  this.phoneId = this.generateUuid(seed);
  this.deviceId = `android-${this.generateHex(seed, 16)}`;
  
  // Use real device models
  this.deviceString = this.getRandomDevice();
  // e.g., "Google/Pixel 5/redfin:11/..."
}
```

---

## Behavioral Analysis

### Suspicious Patterns Instagram Detects

| Pattern | Why It's Suspicious | Threshold (Estimated) |
|---------|--------------------|-----------------------|
| Rapid follows | Bot behavior | >50/hour |
| Rapid unfollows | Follow/unfollow scheme | >30/hour |
| Fast likes | Engagement bots | >100/hour |
| Identical timing | Automated requests | Exact intervals |
| 24/7 activity | No human patterns | No sleep periods |
| Mass DMs | Spam behavior | >20 new threads/hour |

### Timing Analysis

Instagram tracks:
- Time between requests
- Session duration
- Activity hours
- Request patterns

**Human-like behavior:**
- Random delays between actions
- Variable session lengths
- Breaks in activity
- Geographic consistency

### What We Saw in Our Capture

Our account was flagged after:
1. Multiple rapid DM sends
2. Consistent timing between requests
3. Unusual traffic patterns (interception setup)
4. Emulator environment indicators

---

## Network Analysis

### IP-Based Detection

| Signal | Issue |
|--------|-------|
| Datacenter IPs | VPN/proxy detection |
| IP reputation | Known abuse sources |
| Geographic jumps | Impossible travel |
| Multiple accounts/IP | Farm detection |
| Residential vs mobile | Expected for app |

### Connection Fingerprinting

Instagram checks:
- TLS fingerprint (JA3)
- HTTP/2 settings
- Connection persistence
- Network type consistency

### Why Cal Poly VPN Won't Help

Institutional VPNs are problematic because:
1. Limited IP range (many users)
2. May be flagged as datacenter
3. Geographic location may not match device locale
4. Many other users may have triggered flags

---

## Request Validation

### Header Consistency

Instagram validates that headers form a consistent profile:

```
User-Agent device ←→ X-IG-Device-ID
                 ←→ X-IG-Android-ID
                 ←→ X-IG-Capabilities
                 ←→ App version
```

**Inconsistencies we might make:**
- User-Agent says Pixel 5, but capabilities say different device
- App version doesn't match Bloks version
- Android ID format is wrong

### Signature Validation

Some requests require signed payloads:
```
signed_body=SIGNATURE.{json_payload}
```

The signature is generated using a private key embedded in the app. Libraries reverse-engineer this, but Instagram can change it with app updates.

### Request Timing

Instagram monitors:
- `X-Pigeon-Rawclienttime` - Must be recent
- Request timestamp vs server time
- Sequence of requests (pre-login flow expected)

---

## Rate Limiting

### Known Limits (Approximate)

| Action | Limit | Period |
|--------|-------|--------|
| Login attempts | 5 | 1 hour |
| Follows | 200 | 24 hours |
| Unfollows | 200 | 24 hours |
| Likes | 350 | 24 hours |
| Comments | 180 | 24 hours |
| DMs (new threads) | 50 | 24 hours |
| Profile views | 200 | 1 hour |

### Rate Limit Responses

```json
{
  "message": "Please wait a few minutes before you try again.",
  "status": "fail"
}
```

Or HTTP 429 Too Many Requests.

---

## Challenge/Checkpoint System

### When Challenges Trigger

1. **New device** - First login on unknown device
2. **New location** - Login from new IP/region
3. **Suspicious activity** - Bot-like patterns detected
4. **Account security** - Multiple failed logins
5. **Policy violation** - Reported content/behavior

### Challenge Types (from our capture)

```
/api/v1/bloks/apps/com.bloks.www.checkpoint.ufac/
```

The "ufac" likely stands for "User Facing Account Challenge":
- Identity verification
- Email/phone verification
- CAPTCHA challenge
- Photo of yourself challenge

### Our Capture Analysis

```
16:17:27 GET  /api/v1/challenge/?guid=...
16:17:27 POST /checkpoint.ufac/
16:17:31 POST /checkpoint.ufac.complete_intro/
16:17:39 POST /checkpoint.ufac.bot_captcha.submit/
```

Timeline:
1. **16:17:27** - Challenge initiated
2. **16:17:27** - Challenge page loaded
3. **16:17:31** - Intro/instructions shown
4. **16:17:39** - CAPTCHA presented

The 12-second gap suggests user interaction with CAPTCHA.

---

## Mitigation Strategies

### For Development/Research

1. **Use test accounts** - Never your real account
2. **Realistic device profiles** - Use actual device specs
3. **Human-like timing** - Add random delays
4. **Session persistence** - Don't login repeatedly
5. **MQTT over REST** - Looks more like real app

### For Production Use

1. **Rate limiting** - Stay well under limits
2. **Residential proxies** - If IP rotation needed
3. **Real device testing** - Not just emulators
4. **Warm-up periods** - New accounts need activity
5. **Monitor for challenges** - Handle gracefully

### What instagram-cli Does

From their README:
> "We recommend using the TypeScript client when possible since it is much less likely to trigger Instagram's anti-bot mechanisms."

Why:
- Uses MQTT (same as real app)
- Proper device simulation
- Real-time connection (not polling)
- Tested extensively

---

## References

- [Instagram Fingerprint Detection Guide](https://multiaccounts.com/blog/instagram-fingerprint-detection-avoidance-guide-2025)
- [Device Fingerprinting by IPQS](https://www.ipqualityscore.com/device-fingerprinting)
- [Instagram Block Analysis](https://www.rapidseedbox.com/blog/instagram-bans)
