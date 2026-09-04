# CHANGELOG — toru-fca

## v1.0.6 — Ultimate Fixed, Advanced & Merged Release

### 🔴 BROWSER LOGOUT FIX (ROOT CAUSE — FULLY FIXED)

**কারণ:** `forceLogin: true` ছিল।
- Facebook checkpoint এ "This was me" auto-submit করত
- Facebook নতুন session তৈরি করত → পুরনো browser session invalidate → **browser logout**

**Fix (3 স্তরে):**
1. `forceLogin: false` — checkpoint auto-submit বন্ধ → browser session অক্ষুণ্ণ
2. Cookie expiry minimum **1 বছর** — expire হলে session drop থেকে সুরক্ষা
3. SessionGuard হর 3 মিনিটে **cookie expiry extend** — bot চলার সময় কখনো expire হবে না

### ✅ সব Fix একসাথে

| File | Fix |
|---|---|
| `index.js` | forceLogin=false, cookie expiry 1yr, clean rewrite |
| `src/logout.js` | Cleaner no-op with better message |
| `src/refreshFb_dtsg.js` | Better pattern matching, error handling |
| `src/sendTypingIndicatorV2.js` | ctx.mqttClient undefined bug fixed |
| `src/listenMqtt.js` | ForcedFetch DM bug fixed, reaction off+timestamp added |
| `config.json` | facebookProtection added, 3min sessionGuard, 300ms smooth |
| `package.json` | Version 1.0.6 |
| `checkUpdate.js` | Version 1.0.6 |
| `examples/basic-bot.js` | Full rewrite, GoatBot compatible |

### Features Active in v1.0.6

- ✅ Browser logout হবে না (cookie login)
- ✅ Automation restriction আসবে না
- ✅ Inbox/DM এবং Group — উভয়তেই bot reply করবে
- ✅ Reaction detect (off field + timestamp)
- ✅ GoatBot compatible
- ✅ MQTT stable, auto-reconnect
- ✅ E2EE bridge
- ✅ Error-free (no crash)

## v1.0.2 — Previous Stable
- Anti-logout, session guard, inbox fix, GoatBot defaults, MQTT patch stream
