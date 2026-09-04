/**
 * alpha-fca v1.0.0  —  E2EE Bot Example
 *
 * Demonstrates:
 *  - Normal inbox messages (via MQTT)
 *  - E2EE individual chat messages
 *  - E2EE group chat messages
 *  - Sending E2EE replies
 *  - Handling reactions, edits, receipts
 *  - No conflict between Normal and E2EE listeners
 *
 * REQUIREMENTS:
 *  - In config.json set: e2ee.enable = true
 *  - lib/index.mjs and build/messagix.so must be present
 *  - Node.js >= 18
 */

"use strict";

const login = require("../index.js");
const fs    = require("fs");
const path  = require("path");

const APPSTATE_FILE = path.join(__dirname, "..", "appstate.json");

let appState;
try {
  appState = JSON.parse(fs.readFileSync(APPSTATE_FILE, "utf8"));
} catch (err) {
  console.error("[alpha-fca] Could not load appstate.json:", err.message);
  process.exit(1);
}

const options = {
  listenEvents  : true,
  selfListen    : false,
  autoReconnect : true,
  online        : false
};

login({ appState }, options, function (err, api) {
  if (err) {
    console.error("[alpha-fca] Login failed:", err.message || err);
    process.exit(1);
  }

  console.log("[alpha-fca] ✅ Logged in as:", api.getCurrentUserID ? api.getCurrentUserID() : "?");
  api.sessionGuard(APPSTATE_FILE, { interval: 3 * 60 * 1000 });

  // ─── Start E2EE bridge ────────────────────────────────────────────────────
  if (!api.connectE2EE) {
    console.error("[E2EE] connectE2EE not available — ensure config.json has e2ee.enable:true");
    process.exit(1);
  }

  api.connectE2EE(function (err, event) {
    if (err) {
      console.error("[E2EE] Error:", err.message || err);
      return;
    }

    switch (event && event.type) {
      case "e2ee_ready":
        console.log("[E2EE] Bridge ready — syncing device...");
        break;
      case "e2ee_fully_ready":
        console.log("[E2EE] ✅ Bridge fully ready! Receiving E2EE messages.");
        break;
      case "e2ee_connected":
        console.log("[E2EE] Connected.");
        break;
      case "e2ee_disconnected":
        console.log("[E2EE] Disconnected (will auto-reconnect).");
        break;
      case "e2ee_device_data_changed":
        console.log("[E2EE] Device data updated.");
        break;

      // ── E2EE Messages ────────────────────────────────────────────────────
      case "message":
        // NOTE: E2EE messages arrive here with event.isE2EE = true
        // AND as type "message" (not "e2ee_message") for GoatBot compatibility.
        if (event.isE2EE) {
          const { threadID, senderID, body, isGroup, messageID } = event;
          const tag = isGroup ? "[E2EE-Group]" : "[E2EE-DM]";
          console.log(`${tag} ${senderID}: ${body}`);

          // Reply to E2EE messages (routing is automatic via sendMessage)
          if (body && body.toLowerCase() === "ping") {
            api.sendMessage("pong 🏓 (E2EE)", threadID, function (err) {
              if (err) console.error("[E2EE send]", err);
            });
          }
        }
        break;

      case "e2ee_message_reaction":
        console.log("[E2EE] Reaction:", event.reaction, "on", event.messageID);
        break;

      case "e2ee_message_edit":
        console.log("[E2EE] Edit:", event.body, "from", event.senderID);
        break;

      case "e2ee_receipt":
        // Read/delivery receipts — usually safe to ignore
        break;

      default:
        if (event && event.type) console.log("[E2EE event]", event.type);
    }
  }).catch(e => console.error("[E2EE] Connect failed:", e.message));

  // ─── Normal MQTT inbox listener (non-E2EE) ────────────────────────────────
  api.listenMqtt(function (err, event) {
    if (err) { console.error("[MQTT]", err); return; }
    if (!event) return;

    // Skip E2EE events — those come through api.connectE2EE callback above
    if (event.isE2EE) return;

    if (event.type === "message") {
      const { threadID, senderID, body } = event;
      console.log(`[Normal] ${senderID}: ${body}`);
      if (body && body.toLowerCase() === "ping") {
        api.sendMessage("pong! (Normal)", threadID);
      }
    }
  });

  // ── Shutdown ──────────────────────────────────────────────────────────────
  function shutdown() {
    console.log("[alpha-fca] Shutdown...");
    if (api.stopListenMqtt) api.stopListenMqtt();
    const bridge = api.getE2EEBridge && api.getE2EEBridge();
    if (bridge) bridge.disconnect().catch(() => {});
    setTimeout(() => process.exit(0), 2000);
  }
  process.once("SIGINT",  shutdown);
  process.once("SIGTERM", shutdown);
});
