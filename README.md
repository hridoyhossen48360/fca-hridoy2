# toru-fca v1.0.8

**Ultimate Merged, Fixed & Advanced Facebook Chat API**

> Cookie দিয়ে login করলে browser logout হবে না। Facebook automation restriction আসবে না। Bot inbox smooth কাজ করবে।

---

## ✅ Features

| Feature | Status |
|---|---|
| Anti-Logout (browser logout fix) | ✅ Active |
| Automation Detection Block | ✅ Active |
| Inbox Smooth (bot inbox reply) | ✅ Active |
| GoatBot Compatible | ✅ Ready |
| Session Guard (auto-save) | ✅ Every 3min |
| fb_dtsg Auto-Refresh | ✅ Every 20min |
| MQTT Stable Reconnect | ✅ Active |
| Error-Free (no crash) | ✅ Active |
| E2EE Labyrinth Bridge | ✅ Active |
| Facebook Protection | ✅ New in v1.0.6 |
| Human-like Delay | ✅ New in v1.0.6 |

---

## 📦 Install

```bash
npm install
```

---

## 🚀 Usage (GoatBot / Goat-Bot)

```js
const login = require("toru-fca");
const fs = require("fs");

login({ appState: JSON.parse(fs.readFileSync("appstate.json", "utf8")) }, {
  listenEvents: true,
  selfListen: false,
  autoReconnect: true,
  online: false
}, (err, api) => {
  if (err) return console.error(err);

  // Session guard — auto-save appstate
  api.sessionGuard("appstate.json");

  api.listenMqtt((err, event) => {
    if (event.type === "message") {
      api.sendMessage("Hello!", event.threadID);
    }
  });
});
```

---

## ⚙️ config.json Options

```json
{
  "antiLogout": { "enabled": true, "refreshIntervalMs": 1200000 },
  "sessionGuard": { "enabled": true, "intervalMs": 180000 },
  "automation": { "enabled": false },
  "smooth": { "enabled": true, "messageDelay": 300 },
  "facebookProtection": { "enabled": true, "blockAutomationDetection": true, "humanLikeDelay": true },
  "inbox": { "enabled": true, "replyToInbox": true }
}
```

---

## 🔐 Anti-Logout System

Cookie login করলে `api.logout()` automatically blocked হয়।
- ✅ Browser থেকে logout হবে না
- ✅ Automation দিয়ে logout হবে না
- Force logout দরকার হলে: `api.forceLogout()`
- Anti-logout বন্ধ করতে: `api.stopAntiLogout()`

---

## 📊 API Methods

| Method | Description |
|---|---|
| `api.sendMessage(msg, threadID)` | Message পাঠাও |
| `api.listenMqtt(callback)` | Message শোনো |
| `api.sessionGuard(path, opts)` | Appstate auto-save |
| `api.saveSession(path)` | Manual session save |
| `api.getHealth()` | MQTT + session health |
| `api.forceLogout()` | Force logout (opt-in) |
| `api.stopAntiLogout()` | Anti-logout timer বন্ধ |
| `api.refreshFb_dtsg()` | Manual fb_dtsg refresh |
| `api.sendTypingIndicatorV2(typing, threadID)` | MQTT typing indicator |

---

## 🛡️ Facebook Protection (v1.0.6)

- `humanLikeDelay: true` — প্রতিটি message এ random 50-200ms delay, bot traffic pattern unpredictable
- `blockAutomationDetection: true` — online=false, presence update বন্ধ
- ফলে Facebook account এ restriction বা ban আসে না

---

**toru-fca v1.0.6** — Merged from: toru-fca · alpha-fca · mahmud-fca · hridoy-fca
