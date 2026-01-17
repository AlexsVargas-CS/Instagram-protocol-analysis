# Instagram API Endpoints

Documentation of Instagram's private API endpoints discovered through traffic analysis.

## Base URLs

| Domain | Purpose |
|--------|---------|
| `i.instagram.com` | Primary API endpoint |
| `graph.instagram.com` | Analytics/telemetry |
| `b.i.instagram.com` | Media uploads |

---

## Direct Messaging API

### Send Text Message
```
POST /api/v1/direct_v2/threads/broadcast/text/
Host: i.instagram.com
```

**Request Body (form-encoded):**
```
thread_ids=[<thread_id>]
text=<message_content>
action=send_item
client_context=<uuid>
_uuid=<device_uuid>
_uid=<user_id>
```

**Response:**
- `200` - Message sent successfully
- `404` - Thread not found or session invalid

### Get Inbox
```
GET /api/v1/direct_v2/inbox/
Host: i.instagram.com
```

**Query Parameters:**
- `cursor` - Pagination cursor
- `direction` - `older` or `newer`
- `seq_id` - Sequence ID for sync
- `thread_message_limit` - Messages per thread

### Get Thread Messages
```
GET /api/v1/direct_v2/threads/<thread_id>/
Host: i.instagram.com
```

### Mark Thread as Seen
```
POST /api/v1/direct_v2/threads/<thread_id>/items/<item_id>/seen/
Host: i.instagram.com
```

---

## Batch/Query Endpoints

### Batch Fetch
```
POST /api/v1/qp/batch_fetch/
Host: i.instagram.com
```

Used to fetch multiple data types in a single request.

### GraphQL Query
```
POST /graphql/query
Host: i.instagram.com
```

**Request Body:**
```
doc_id=<query_id>
variables=<json_variables>
```

---

## Notifications

### Get Notification Badge Count
```
POST /api/v1/notifications/badge/
Host: i.instagram.com
```

---

## Challenge/Security Endpoints

These endpoints are triggered when Instagram detects suspicious activity.

### Challenge Request
```
GET /api/v1/challenge/?guid=<guid>&device_id=<device_id>
Host: i.instagram.com
```

### Checkpoint Flow
```
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac/
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac.controller/
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac.complete_intro/
POST /api/v1/bloks/apps/com.bloks.www.checkpoint.ufac.bot_captcha.submit/
```

> ⚠️ These endpoints indicate your account has been flagged for bot-like behavior

---

## Analytics/Telemetry

### RMD (Real-time Metrics Data)
```
POST /rmd?access_token=<app_access_token>&rule_context=...
Host: graph.instagram.com
```

This endpoint sends app telemetry to Instagram. It continues working even when other APIs fail (useful for detecting account issues).

---

## Authentication

### Login
```
POST /api/v1/accounts/login/
Host: i.instagram.com
```

### Two-Factor Authentication
```
POST /api/v1/accounts/two_factor_login/
Host: i.instagram.com
```

### Logout
```
POST /api/v1/accounts/logout/
Host: i.instagram.com
```

---

## Response Codes

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Bad request / validation error |
| `401` | Unauthorized (need to re-login) |
| `403` | Forbidden (rate limited or blocked) |
| `404` | Not found or invalid session |
| `429` | Rate limited |
| `500` | Server error |

---

## Observations from Traffic Capture

### Pattern: 404 Responses
In our capture, we observed multiple `404` responses on the DM endpoint:
```
16:11:41 POST /api/v1/direct_v2/threads/broadcast/text/ → 404
16:11:43 POST /api/v1/direct_v2/threads/broadcast/text/ → 404
```

This indicates the session was being invalidated in real-time.

### Pattern: Challenge Flow
The capture showed Instagram triggering a challenge:
```
16:17:27 GET /api/v1/challenge/?guid=...
16:17:27 POST /checkpoint.ufac/
16:17:39 POST /checkpoint.ufac.bot_captcha.submit/
```

This is Instagram's anti-bot detection activating.

### Pattern: Telemetry Still Working
Even after DM calls failed, telemetry calls succeeded:
```
POST graph.instagram.com /rmd?access_token=... → 200
```

Instagram still accepts metrics data even when blocking other actions.

---

## TODO

- [ ] Document media upload endpoints
- [ ] Document story viewing endpoints
- [ ] Document user search/profile endpoints
- [ ] Capture MQTT connection handshake
- [ ] Document feed/timeline endpoints
