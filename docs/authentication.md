# Instagram Authentication

Documentation of Instagram's authentication flow and session management.

## Authentication Flow Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Login     │────>│   2FA/      │────>│  Session    │
│   Request   │     │  Challenge  │     │  Created    │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           v
                    ┌─────────────┐
                    │  Challenge  │
                    │   (CAPTCHA) │
                    └─────────────┘
```

---

## Initial Login

### Endpoint
```
POST /api/v1/accounts/login/
Host: i.instagram.com
```

### Request Body
```
signed_body=<signature>.<payload>
```

Where `<payload>` is URL-encoded JSON:
```json
{
  "jazoest": "22...",
  "phone_id": "<uuid>",
  "enc_password": "#PWD_INSTAGRAM:4:<timestamp>:<encrypted>",
  "username": "<username>",
  "adid": "<uuid>",
  "guid": "<uuid>",
  "device_id": "android-<hex>",
  "google_tokens": "[]",
  "login_attempt_count": "0"
}
```

### Password Encryption

Instagram uses encrypted passwords. The format is:
```
#PWD_INSTAGRAM:<version>:<timestamp>:<encrypted_password>
```

Version 4 uses AES-GCM-256 encryption with Instagram's public key.

### Response (Success)
```json
{
  "logged_in_user": {
    "pk": 12345678,
    "username": "testuser",
    "full_name": "Test User",
    "is_private": false,
    ...
  },
  "session_flush_nonce": null,
  "status": "ok"
}
```

### Response Cookies
```
sessionid=<session_id>; Path=/; Domain=.instagram.com; Secure; HttpOnly
csrftoken=<csrf_token>; Path=/; Domain=.instagram.com; Secure
ds_user_id=<user_id>; Path=/; Domain=.instagram.com; Secure
```

---

## Two-Factor Authentication

If 2FA is enabled, the login response will include:
```json
{
  "message": "checkpoint_required",
  "two_factor_required": true,
  "two_factor_info": {
    "two_factor_identifier": "<identifier>",
    "username": "<username>",
    "obfuscated_phone_number": "***-***-1234",
    "sms_two_factor_on": true,
    "totp_two_factor_on": false
  },
  "status": "fail"
}
```

### 2FA Verification Endpoint
```
POST /api/v1/accounts/two_factor_login/
```

### Request Body
```json
{
  "verification_code": "123456",
  "two_factor_identifier": "<identifier>",
  "username": "<username>",
  "device_id": "<device_id>",
  "trust_this_device": "1"
}
```

---

## Challenge Flow (Anti-Bot)

When Instagram detects suspicious activity, it triggers a challenge.

### Challenge Types

| Type | Description |
|------|-------------|
| `SelectVerificationMethodForm` | Choose email or phone verification |
| `VerifyEmailCodeForm` | Enter code sent to email |
| `VerifySMSCodeForm` | Enter code sent to phone |
| `RecaptchaChallengeForm` | Solve CAPTCHA |
| `SubmitPhoneNumberForm` | Verify phone number |

### Challenge Endpoints (from our capture)
```
GET  /api/v1/challenge/?guid=<guid>&device_id=<device>
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac/
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac.controller/
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac.complete_intro/
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac.bot_captcha.submit/
```

### Handling Challenges Programmatically
```javascript
try {
  await ig.account.login(username, password);
} catch (error) {
  if (error instanceof IgCheckpointError) {
    // Request challenge
    await ig.challenge.auto(true);
    
    // Get code from user
    const code = await promptUser('Enter verification code:');
    
    // Submit code
    await ig.challenge.sendSecurityCode(code);
  }
}
```

---

## Session Management

### Session State

A valid session consists of:
```javascript
{
  cookies: {
    sessionid: '<session_id>',
    csrftoken: '<csrf_token>',
    ds_user_id: '<user_id>',
    mid: '<machine_id>',
    ig_did: '<device_id>',
    rur: '<region>'
  },
  device: {
    deviceId: '<uuid>',
    phoneId: '<uuid>',
    adid: '<uuid>',
    androidId: 'android-<hex>'
  },
  user: {
    pk: 12345678,
    username: 'testuser'
  }
}
```

### Saving Session
```javascript
// Serialize state
const state = ig.state.serialize();
fs.writeFileSync('session.json', JSON.stringify(state));
```

### Restoring Session
```javascript
// Load state
const state = JSON.parse(fs.readFileSync('session.json'));
await ig.state.deserialize(state);

// Verify session is still valid
try {
  await ig.account.currentUser();
  console.log('Session valid');
} catch {
  console.log('Session expired, need to re-login');
}
```

---

## Token Types

### Authorization Header Token
```
Authorization: Bearer IGT:2:<base64_json>
```

The token contains:
```json
{
  "ds_user_id": "12345678",
  "sessionid": "<session_id>",
  "should_use_header_over_cookies": true
}
```

### CSRF Token
- Sent in both `X-CSRFToken` header and `csrftoken` cookie
- Changes with each session
- Required for state-changing requests

---

## Session Expiration

Sessions can be invalidated by:
1. **Password change** - All sessions invalidated
2. **Logout** - Current session invalidated
3. **Inactivity** - ~90 days without use
4. **Security detection** - Suspicious activity
5. **Manual revocation** - User revokes from settings

### Detecting Expired Session
```javascript
// Response status 401 or
{
  "message": "login_required",
  "status": "fail"
}

// Or specific error
{
  "message": "checkpoint_required",
  "checkpoint_url": "/challenge/...",
  "status": "fail"
}
```

---

## Security Recommendations

1. **Never store plain passwords** - Only store session tokens
2. **Use test accounts** - Never use primary account for development
3. **Implement rate limiting** - Don't make requests too fast
4. **Handle challenges gracefully** - Have a flow for verification
5. **Rotate device IDs carefully** - Frequent changes look suspicious

---

## References

- [instagram-private-api login flow](https://github.com/dilame/instagram-private-api)
- [Password encryption research](https://github.com/nickolasdaniel/instagram-password-encryption)
