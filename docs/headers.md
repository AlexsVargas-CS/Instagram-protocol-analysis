# Instagram API Headers Reference

Documentation of HTTP headers required for Instagram's private API.

## Required Headers

### Authentication Headers

| Header | Example Value | Purpose |
|--------|---------------|---------|
| `Authorization` | `Bearer IGT:2:eyJkc19...` | JWT authentication token |
| `X-IG-App-ID` | `567067343352427` | Instagram app identifier (constant) |
| `X-CSRFToken` | `abc123...` | CSRF protection token |

### Device Identification Headers

| Header | Example Value | Purpose |
|--------|---------------|---------|
| `X-IG-Device-ID` | `a1b2c3d4-e5f6-...` | Unique device UUID |
| `X-IG-Android-ID` | `android-abc123...` | Android device ID |
| `X-IG-Family-Device-ID` | `a1b2c3d4-e5f6-...` | Meta family device ID |
| `X-Pigeon-Session-Id` | `UFS-abc123-...` | Session tracking ID |
| `X-Pigeon-Rawclienttime` | `1704067200.123` | Client timestamp |

### App Version Headers

| Header | Example Value | Purpose |
|--------|---------------|---------|
| `X-IG-App-Locale` | `en_US` | App language |
| `X-IG-Device-Locale` | `en_US` | Device language |
| `X-IG-App-Startup-Country` | `US` | Initial country |
| `X-Bloks-Version-Id` | `abc123...` | Bloks framework version |
| `X-IG-WWW-Claim` | `0` | Web claim flag |
| `X-Bloks-Is-Layout-RTL` | `false` | Right-to-left layout |

### Connection Headers

| Header | Example Value | Purpose |
|--------|---------------|---------|
| `X-IG-Connection-Type` | `WIFI` | Connection type |
| `X-IG-Capabilities` | `3brTvx0=` | Base64 encoded capabilities |
| `X-IG-Connection-Speed` | `1000kbps` | Connection speed |
| `X-IG-Bandwidth-Speed-KBPS` | `5000.000` | Bandwidth speed |
| `X-IG-Bandwidth-TotalBytes-B` | `1000000` | Total bytes |
| `X-IG-Bandwidth-TotalTime-MS` | `200` | Total time |

---

## User-Agent String

The User-Agent is critical - Instagram validates it carefully.

### Format
```
Instagram <version> Android (<android_version>/<api_level>; <dpi>; <resolution>; <manufacturer>; <device>; <model>; <cpu>; <locale>; <version_code>)
```

### Example
```
Instagram 361.0.0.46.88 Android (30/11; 420dpi; 1080x2400; Google; Pixel 5; redfin; redfin; en_US; 634953193)
```

### Components Breakdown

| Component | Example | Description |
|-----------|---------|-------------|
| App Version | `361.0.0.46.88` | Instagram version |
| Android Version | `30` | API level (Android 11 = 30) |
| SDK Version | `11` | Android SDK version |
| DPI | `420dpi` | Screen density |
| Resolution | `1080x2400` | Screen resolution |
| Manufacturer | `Google` | Device manufacturer |
| Device | `Pixel 5` | Device name |
| Model | `redfin` | Device codename |
| CPU | `redfin` | CPU identifier |
| Locale | `en_US` | Device locale |
| Version Code | `634953193` | Internal version code |

---

## Cookie Headers

### Required Cookies

| Cookie | Purpose |
|--------|---------|
| `sessionid` | Session identifier |
| `csrftoken` | CSRF token |
| `ds_user_id` | User ID |
| `mid` | Machine ID |
| `ig_did` | Device ID |
| `rur` | Region routing |

---

## Content Headers

### For POST Requests
```
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
```

### For JSON Requests
```
Content-Type: application/json; charset=UTF-8
```

### For Media Uploads
```
Content-Type: multipart/form-data; boundary=<boundary>
```

---

## Example Complete Request

```http
POST /api/v1/direct_v2/threads/broadcast/text/ HTTP/1.1
Host: i.instagram.com
User-Agent: Instagram 361.0.0.46.88 Android (30/11; 420dpi; 1080x2400; Google; Pixel 5; redfin; redfin; en_US; 634953193)
Authorization: Bearer IGT:2:eyJkc19...
X-IG-App-ID: 567067343352427
X-IG-Device-ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
X-IG-Android-ID: android-abcdef123456
X-CSRFToken: abc123def456
X-IG-Connection-Type: WIFI
X-IG-Capabilities: 3brTvx0=
Content-Type: application/x-www-form-urlencoded; charset=UTF-8
Cookie: sessionid=12345; csrftoken=abc123; ds_user_id=67890; mid=xyz

thread_ids=[340282366841710300949128123456789012345]&text=Hello&action=send_item&client_context=6789012345&_uuid=a1b2c3d4-e5f6-7890-abcd-ef1234567890&_uid=67890
```

---

## Header Generation Notes

### Device ID Generation
```javascript
// UUID v4 format
function generateDeviceId() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}
```

### Android ID Generation
```javascript
function generateAndroidId() {
    const hex = crypto.randomBytes(8).toString('hex');
    return `android-${hex}`;
}
```

### Pigeon Session ID
```javascript
function generatePigeonSessionId() {
    const uuid = generateDeviceId();
    const timestamp = Date.now();
    return `UFS-${uuid}-${timestamp}`;
}
```

---

## Validation & Anti-Bot Detection

Instagram validates several header combinations:

1. **User-Agent consistency** - Device info must match across headers
2. **Timestamp freshness** - `X-Pigeon-Rawclienttime` must be recent
3. **Device fingerprint** - Headers must form a consistent device profile
4. **Request timing** - Requests too fast = bot detection
5. **Capability flags** - Must match what the app version supports

---

## TODO

- [ ] Document Instagram Signature header (signed_body)
- [ ] Document X-IG-Capabilities encoding
- [ ] Map version codes to app versions
- [ ] Document Bloks version requirements
