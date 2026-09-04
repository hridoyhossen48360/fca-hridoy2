/**
 * toru-fca v1.0.6 — basic-bot.js (GoatBot compatible example)
 *
 * Features:
 *  ✅ Cookie login — browser logout হবে না
 *  ✅ Inbox + Group — উভয়তেই bot reply করবে
 *  ✅ Session guard — appstate হর 3 মিনিটে auto-save
 *  ✅ Anti-logout — fb_dtsg 20 মিনিটে refresh
 *  ✅ Facebook protection — automation detection bypass
 *  ✅ Graceful shutdown
 */

"use strict";

const login = require("../index.js");
const fs    = require("fs");
const path  = require("path");

const APPSTATE_FILE = path.join(__dirname, "..", "appstate.json");

// ── Load appState (Cookie) ────────────────────────────────────────────────────
let appState;
try {
  appState = JSON.parse(fs.readFileSync(APPSTATE_FILE, "utf8"));
} catch (err) {
  console.error("[toru-fca] ❌ Could not load appstate.json:", err.message);
  process.exit(1);
}

// ── Login options (GoatBot compatible) ───────────────────────────────────────
const options = {
  listenEvents    : true,
  selfListen      : false,   // bot নিজের message শুনবে না
  autoReconnect   : true,
  online          : false,   // automation detection bypass
  updatePresence  : false,
  forceLogin      : false,   // browser logout fix
  autoMarkRead    : false,
  autoMarkDelivery: false,
  logLevel        : "verbose"
};

// ── Login ─────────────────────────────────────────────────────────────────────
login({ appState }, options, function (err, api) {
  if (err) { console.error("[toru-fca] ❌ Login failed:", err.message || err); process.exit(1); }

  const botID = api.getCurrentUserID ? api.getCurrentUserID() : "unknown";
  console.log("[toru-fca] ✅ Bot running as:", botID);

  // Session guard — auto-save appstate হর 3 মিনিটে
  api.sessionGuard(APPSTATE_FILE, { interval: 3 * 60 * 1000, backup: true });

  // ── Main listener ─────────────────────────────────────────────────────────
  api.listenMqtt(function (err, event) {
    if (err) { console.error("[listen]", err); return; }

    // Group এবং Inbox/DM — উভয়তেই কাজ করবে
    if (event.type === "message") {
      const { threadID, senderID, body, isGroup } = event;
      const tag = isGroup ? "[Group]" : "[Inbox/DM]";
      console.log(tag, senderID + ":", body);

      // Echo bot
      if (body && body.toLowerCase() === "ping") {
        api.sendMessage("🏓 pong! — toru-fca v1.0.6", threadID);
      }
    }

    // Reaction detect
    if (event.type === "message_reaction") {
      console.log("[Reaction]", event.senderID, event.off ? "removed reaction" : "reacted:", event.reaction);
    }

    // Events (group join, leave, etc.)
    if (event.type === "event") {
      console.log("[Event]", event.logMessageType || event.type);
    }
  });

  // ── Graceful shutdown ─────────────────────────────────────────────────────
  function shutdown() {
    console.log("[toru-fca] Shutting down...");
    if (api.stopAntiLogout)  api.stopAntiLogout();
    if (api.stopListenMqtt)  api.stopListenMqtt();
    setTimeout(() => process.exit(0), 1000);
  }
  process.once("SIGINT",  shutdown);
  process.once("SIGTERM", shutdown);
});
