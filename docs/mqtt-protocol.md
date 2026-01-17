# Instagram MQTT Protocol

Instagram uses MQTT for real-time messaging instead of traditional REST API polling. This document covers what we've learned about their implementation.

## Overview

### Why MQTT?

| REST API | MQTT |
|----------|------|
| Request/response | Bidirectional |
| Polling required | Real-time push |
| Higher latency | Sub-500ms latency |
| More detectable | Mimics app exactly |

Instagram's mobile app uses MQTT for:
- Direct messages (send/receive)
- Typing indicators
- Presence (online status)
- Push notifications
- Live comments/reactions

---

## MQTToT Protocol

Instagram uses a **modified version of MQTT 3** called "MQTToT" (MQTT over Thrift).

### Key Differences from Standard MQTT

1. **Connect Packet**
   - No `clientId` in the standard location
   - Contains a **zipped Thrift payload** instead
   - Username/password are in the payload, not as strings

2. **CONNACK Packet**
   - Can contain a payload (standard MQTT3 says remaining length should be 0)
   - Returns authentication data for future connections

3. **Payload Encoding**
   - Uses Facebook's Thrift serialization
   - Data is compressed (zlib)

---

## Connection Flow

```
┌─────────┐                    ┌─────────────────┐
│  Client │                    │ Instagram MQTT  │
│         │                    │     Broker      │
└────┬────┘                    └────────┬────────┘
     │                                  │
     │  1. CONNECT (Thrift payload)     │
     │─────────────────────────────────>│
     │                                  │
     │  2. CONNACK (auth tokens)        │
     │<─────────────────────────────────│
     │                                  │
     │  3. SUBSCRIBE (topics)           │
     │─────────────────────────────────>│
     │                                  │
     │  4. SUBACK                       │
     │<─────────────────────────────────│
     │                                  │
     │  5. PUBLISH (messages)           │
     │<────────────────────────────────>│
     │                                  │
```

---

## MQTT Topics

### Realtime Topics
```
/ig_realtime_sub          # Real-time subscriptions
/ig_message_sync          # Message synchronization
/ig_send_message          # Send messages
/ig_send_message_response # Message send responses
/t_region_hint            # Region routing
/pubsub                   # General pub/sub
```

### FBNS (Push Notification) Topics
```
/fbns_reg_req             # Registration request
/fbns_reg_resp            # Registration response
/fbns_msg                 # Push notifications
```

---

## GraphQL Subscriptions

Instagram uses GraphQL subscriptions over MQTT for real-time updates.

### Common Subscriptions
```javascript
// Typing indicators
GraphQLSubscriptions.getDirectTypingSubscription(userId)

// Presence (online status)
GraphQLSubscriptions.getAppPresenceSubscription()

// Live comments
GraphQLSubscriptions.getLiveRealtimeCommentsSubscription(broadcastId)

// Config updates
GraphQLSubscriptions.getClientConfigUpdateSubscription()
```

---

## Message Structure

### Incoming Message Example
```json
{
  "event": "message",
  "data": {
    "thread_id": "340282366841710300949128...",
    "item_id": "30221234567890123456",
    "user_id": "12345678",
    "timestamp": "1704067200000000",
    "item_type": "text",
    "text": "Hello!"
  }
}
```

### Outgoing Message Example
```json
{
  "thread_id": "340282366841710300949128...",
  "text": "Hello back!",
  "action": "send_item",
  "client_context": "6789012345678901234"
}
```

---

## Libraries

### instagram_mqtt (Node.js)

The primary library for MQTT support: [Nerixyz/instagram_mqtt](https://github.com/Nerixyz/instagram_mqtt)

```javascript
import { IgApiClient } from 'instagram-private-api';
import { withRealtime } from 'instagram_mqtt';

// Wrap client with realtime support
const ig = withRealtime(new IgApiClient());

// Login
ig.state.generateDevice(username);
await ig.account.login(username, password);

// Connect to MQTT
await ig.realtime.connect({
    graphQlSubs: [
        // Add subscriptions
    ]
});

// Listen for messages
ig.realtime.on('message', (data) => {
    console.log('New message:', data);
});

// Listen for typing
ig.realtime.on('direct', (data) => {
    if (data.event === 'typing') {
        console.log('User typing...');
    }
});
```

---

## Reverse Engineering MQTT

### Tools Used

1. **Frida** - Dynamic instrumentation
   ```bash
   frida -U -n com.instagram.android -l mqtt_hook.js
   ```

2. **Wireshark** - Packet capture (though data is encrypted)

3. **mitmproxy** - Can capture the initial REST auth, but not MQTT directly

### Capturing MQTT Traffic

MQTT traffic is harder to intercept than REST because:
- Uses a persistent TLS connection
- Binary protocol (not human-readable)
- Thrift-encoded payloads

The `instagram_mqtt` library was reverse-engineered using Frida to hook into the Instagram app's MQTT client implementation.

---

## Comparison: REST vs MQTT for DMs

### REST Approach (what we captured)
```
POST /api/v1/direct_v2/threads/broadcast/text/
- One request per message
- Must poll for incoming messages
- Easier to detect as bot
```

### MQTT Approach (what instagram-cli uses)
```
PUBLISH to /ig_send_message
- Persistent connection
- Real-time receive
- Looks like normal app
```

---

## TODO

- [ ] Capture actual MQTT handshake
- [ ] Document Thrift payload structure
- [ ] Understand sequence ID synchronization
- [ ] Document FBNS registration flow
- [ ] Map all GraphQL subscription types

---

## References

- [instagram_mqtt source code](https://github.com/Nerixyz/instagram_mqtt)
- [MQTToT documentation in library](https://github.com/Nerixyz/instagram_mqtt#mqttot)
- [instagram-private-api](https://github.com/dilame/instagram-private-api)
