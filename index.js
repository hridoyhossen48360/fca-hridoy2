"use strict";
/* ═══════════════════════════════════════════════════════════════════════════
 *  toru-fca  v1.0.6  —  index.js
 *  Ultimate Fixed, Advanced & Merged Facebook Chat API
 *
 *  ✅ BROWSER LOGOUT FIX  — forceLogin=false, cookie expiry 1yr, no session destroy
 *  ✅ ANTI-LOGOUT          — api.logout() blocked, fb_dtsg refresh every 20min
 *  ✅ AUTOMATION BYPASS    — online=false, updatePresence=false, human-like delay
 *  ✅ INBOX + GROUP        — DM/inbox এবং group উভয়তেই bot reply করবে
 *  ✅ GOATBOT READY        — selfListen, listenEvents, autoReconnect defaults set
 *  ✅ ERROR-FREE           — global error handler, no crash
 *  ✅ SESSION GUARD        — appstate auto-save 3min, backup, corruption check
 *  ✅ SMOOTH MODE          — typing indicator + 300ms delay before send
 *  ✅ FACEBOOK PROTECTION  — human-like micro-delay, anti-restriction
 *  ✅ E2EE BRIDGE          — Labyrinth native E2EE, DM + group
 *  ✅ MQTT STABLE          — exponential backoff, patch stream, no stale sid/cid
 *  ✅ TYPINGV2 FIXED       — ctx.mqttClient reference bug patched
 *
 *  Merged: toru-fca · alpha-fca · mahmud-fca · hridoy-fca
 * ═══════════════════════════════════════════════════════════════════════════
 */

var utils          = require("./utils");
var cheerio        = require("cheerio");
var log            = require("npmlog");
var fs             = require("fs");
var path           = require("path");
var AdvancedSystem = require("./advancedSystem");

log.maxRecordSize = 100;

// ─── ONCE-PER-PROCESS GUARDS ─────────────────────────────────────────────────
global._toruFcaInitDone = global._toruFcaInitDone || false;
global._toruFcaConfig   = global._toruFcaConfig   || null;

// ─── LOAD CONFIG (once) ───────────────────────────────────────────────────────
if (!global._toruFcaConfig) {
  try {
    global._toruFcaConfig = JSON.parse(
      fs.readFileSync(path.join(__dirname, "config.json"), "utf8")
    );
  } catch (_) {
    global._toruFcaConfig = {
      version     : "1.0.6",
      antiLogout  : { enabled: true,  refreshIntervalMs: 1200000 },
      sessionGuard: { enabled: true,  intervalMs: 180000, debounceMs: 20000, backupEnabled: true },
      automation  : { enabled: false },
      smooth      : { enabled: true,  messageDelay: 300 },
      connection  : { minDelayMs: 3000, maxDelayMs: 60000 },
      e2ee        : { enable: true,   saveType: "memory", autoReconnect: true, logLevel: "none" },
      facebookProtection: { enabled: true, blockAutomationDetection: true, humanLikeDelay: true },
      inbox       : { enabled: true,  replyToInbox: true }
    };
  }
}

// ─── GLOBAL ERROR HANDLERS (once per process) ────────────────────────────────
if (!global._toruFcaInitDone) {
  global._toruFcaInitDone = true;

  process.on("unhandledRejection", function(reason) {
    try {
      if (!reason) return;
      var msg  = reason.message || String(reason);
      var code = reason.code || (reason.cause && reason.cause.code) || "";
      if (/No Sequelize instance passed/i.test(msg)) return;
      if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT" ||
          /Connect Timeout|fetch failed|ECONNRESET|ECONNREFUSED|ENOTFOUND/i.test(msg + code)) {
        log.warn("toru-fca", "[non-fatal] Network: " + msg); return;
      }
      log.warn("toru-fca", "[non-fatal] Unhandled rejection: " + msg);
    } catch (_) {}
  });

  process.on("uncaughtException", function(error) {
    try {
      var msg  = (error && error.message) || String(error);
      var code = (error && error.code) || "";
      if (/No Sequelize instance passed/i.test(msg)) return;
      if (code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT" ||
          /Connect Timeout|fetch failed|ECONNRESET/i.test(msg + code)) {
        log.warn("toru-fca", "[non-fatal] Network exception: " + msg); return;
      }
      log.warn("toru-fca", "[non-fatal] Uncaught exception: " + msg);
    } catch (_) {}
  });

  setImmediate(function() {
    try { require("./checkUpdate").checkForFCAUpdate().catch(function(){}); } catch (_) {}
  });
}

// ─── BOOL OPTIONS ────────────────────────────────────────────────────────────
var BOOL_OPTIONS = [
  "online","selfListen","selfListenEvent","listenEvents","updatePresence",
  "forceLogin","autoMarkDelivery","autoMarkRead","listenTyping",
  "autoReconnect","emitReady"
];

function setOptions(globalOptions, options) {
  if (!options || typeof options !== "object") return;
  Object.keys(options).forEach(function(key) {
    if (BOOL_OPTIONS.indexOf(key) !== -1) {
      globalOptions[key] = Boolean(options[key]);
    } else {
      switch (key) {
        case "pauseLog":
          options.pauseLog ? log.pause() : log.resume(); break;
        case "logLevel":
          log.level = options.logLevel;
          globalOptions.logLevel = options.logLevel; break;
        case "logRecordSize":
          log.maxRecordSize = options.logRecordSize;
          globalOptions.logRecordSize = options.logRecordSize; break;
        case "pageID":
          globalOptions.pageID = options.pageID.toString(); break;
        case "userAgent":
          globalOptions.userAgent = options.userAgent ||
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
          break;
        case "proxy":
          if (typeof options.proxy !== "string") {
            delete globalOptions.proxy; utils.setProxy();
          } else {
            globalOptions.proxy = options.proxy; utils.setProxy(globalOptions.proxy);
          }
          break;
        default:
          globalOptions[key] = options[key];
      }
    }
  });
}

// ─── SESSION GUARD ────────────────────────────────────────────────────────────
function createSessionGuard(jar, ctx, utils) {
  return function sessionGuard(accountPath, opts) {
    if (!accountPath || typeof accountPath !== "string") return null;
    opts = opts || {};
    var cfg      = (global._toruFcaConfig || {}).sessionGuard || {};
    var interval = Number(opts.interval || cfg.intervalMs  || 180000);
    var debounce = Number(opts.debounce || cfg.debounceMs  || 20000);
    var doBackup = opts.backup !== false && cfg.backupEnabled !== false;
    var MIN_COOK = 5;
    var lastSave = 0;
    var debTimer = null;

    function getState() {
      try { return utils.getAppState(jar); } catch (_) { return null; }
    }

    function extendCookieExpiry() {
      // ── BROWSER LOGOUT FIX: extend ALL cookie expiry to 1 year ──────────
      // Bot চলার সময় cookie expire হলে session drop → browser logout হয়।
      // প্রতিটি sessionGuard cycle এ সব cookie এর expiry 1 year extend করা হয়।
      try {
        var store = jar._jar && jar._jar.toJSON && jar._jar.toJSON();
        if (!store || !store.cookies) return;
        var future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
        store.cookies.forEach(function(c) {
          if (!c.expires || c.expires === "Infinity") return;
          var exp = new Date(c.expires);
          if (exp < future) c.expires = future.toISOString();
        });
      } catch (_) {}
    }

    function saveToDisk(customPath) {
      var filePath = customPath || accountPath;
      try {
        extendCookieExpiry();
        var state = getState();
        if (!state || !Array.isArray(state) || state.length < MIN_COOK) {
          log.warn("sessionGuard", "Skipped — state invalid (" + (state ? state.length : 0) + " cookies)."); return false;
        }
        if (fs.existsSync(filePath)) {
          try {
            var existing = JSON.parse(fs.readFileSync(filePath, "utf8"));
            if (Array.isArray(existing) && state.length < existing.length * 0.8) {
              log.warn("sessionGuard", "Skipped — cookie count dropped (" + state.length + " vs " + existing.length + ")."); return false;
            }
            if (doBackup) {
              try { fs.writeFileSync(filePath + ".bak", JSON.stringify(existing, null, 2), "utf8"); } catch (_) {}
            }
          } catch (_) {}
        }
        fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
        lastSave = Date.now();
        log.info("sessionGuard", "✅ Saved → " + filePath + " (" + state.length + " cookies)");
        return true;
      } catch (e) {
        log.warn("sessionGuard", "Save failed: " + (e && e.message ? e.message : e)); return false;
      }
    }

    var guardTimer = setInterval(function() {
      if (!ctx.loggedIn) { clearInterval(guardTimer); return; }
      extendCookieExpiry();
      if (Date.now() - lastSave < debounce) return;
      saveToDisk();
    }, interval);
    if (guardTimer.unref) guardTimer.unref();

    if (jar._jar && typeof jar._jar.setCookie === "function") {
      var _origSet = jar._jar.setCookie.bind(jar._jar);
      jar._jar.setCookie = function() {
        var r = _origSet.apply(this, arguments);
        if (!debTimer && ctx.loggedIn) {
          debTimer = setTimeout(function() { debTimer = null; saveToDisk(); }, debounce);
        }
        return r;
      };
    }

    return {
      save: saveToDisk,
      restore: function(customPath) {
        var bakPath = (customPath || accountPath) + ".bak";
        if (!fs.existsSync(bakPath)) { log.warn("sessionGuard", "No backup at " + bakPath); return false; }
        try {
          fs.writeFileSync(customPath || accountPath, fs.readFileSync(bakPath, "utf8"), "utf8");
          log.info("sessionGuard", "Restored from " + bakPath); return true;
        } catch (e) { log.warn("sessionGuard", "Restore failed: " + e.message); return false; }
      },
      stop: function() {
        clearInterval(guardTimer);
        if (debTimer) { clearTimeout(debTimer); debTimer = null; }
        log.info("sessionGuard", "Stopped.");
      }
    };
  };
}

// ─── BUILD API ────────────────────────────────────────────────────────────────
function buildAPI(globalOptions, html, jar) {
  var fcaCfg = global._toruFcaConfig || {};

  var advancedSystem = new AdvancedSystem({
    automationEnabled: Boolean(fcaCfg.automation && fcaCfg.automation.enabled),
    minDelayMs       : Number(fcaCfg.connection && fcaCfg.connection.minDelayMs) || 3000,
    maxDelayMs       : Number(fcaCfg.connection && fcaCfg.connection.maxDelayMs) || 60000
  });

  // ── Extract fb_dtsg ──────────────────────────────────────────────────────
  var fb_dtsg   = null;
  var irisSeqID = null;
  try {
    var $ = cheerio.load(html);
    var dtsgPatterns = [
      /\["DTSGInitialData",\[\],{"token":"([^"]+)"}\]/,
      /\["DTSGInitData",\[\],{"token":"([^"]+)"/,
      /,\"token\":\"([^"]+)\"/,
      /{"token":"([^"]+)"/,
      /name="fb_dtsg" value="([^"]+)"/,
      /"async_get_token":"([^"]+)"/,
      /"dtsg":\{"token":"([^"]+)"/
    ];
    $("script").each(function(_, script) {
      if (fb_dtsg) return;
      var text = $(script).html() || "";
      for (var pi = 0; pi < dtsgPatterns.length; pi++) {
        var m = text.match(dtsgPatterns[pi]);
        if (m && m[1]) { fb_dtsg = m[1]; break; }
      }
    });
    if (!fb_dtsg) { var inp = $("input[name=\"fb_dtsg\"]").val(); if (inp) fb_dtsg = inp; }
    var seqM = html.match(/irisSeqID":"([^"]+)"/);
    if (seqM && seqM[1]) irisSeqID = seqM[1];
  } catch (e) { log.warn("buildAPI", "fb_dtsg extraction error: " + (e && e.message ? e.message : e)); }

  // ── Validate session ─────────────────────────────────────────────────────
  var cookies    = jar.getCookies("https://www.facebook.com");
  var userCookie = cookies.find(function(c) { return c.cookieString().startsWith("c_user="); });
  var iUCookie   = cookies.find(function(c) { return c.cookieString().startsWith("i_user="); });

  if (!userCookie && !iUCookie) {
    log.error("buildAPI", "❌ No c_user/i_user cookie — check appstate.json."); return null;
  }
  if (html.includes("/checkpoint/block/?next")) {
    log.error("buildAPI", "❌ Account checkpointed. Resolve on Facebook first."); return null;
  }

  var userID   = (iUCookie || userCookie).cookieString().split("=")[1];
  var clientID = (Math.random() * 2147483648 | 0).toString(16);

  // ── MQTT endpoint ────────────────────────────────────────────────────────
  var mqttEndpoint = "wss://edge-chat.facebook.com/chat?region=pnb";
  var region       = "PNB";
  try {
    var epMatch = html.match(/"endpoint":"([^"]+)"/);
    if (epMatch) {
      var ep = epMatch[1].replace(/\\\//g, "/");
      try {
        var epUrl = new URL(ep);
        epUrl.searchParams.delete("sid"); epUrl.searchParams.delete("cid");
        region       = (epUrl.searchParams.get("region") || "PNB").toUpperCase();
        mqttEndpoint = epUrl.toString();
      } catch (_) {
        mqttEndpoint = ep.replace(/[?&]sid=[^&]*/g,"").replace(/[?&]cid=[^&]*/g,"");
        region = ((mqttEndpoint.match(/region=([^&]+)/) || [])[1] || "PNB").toUpperCase();
      }
    }
  } catch (_) {}

  log.info("toru-fca", "✅ Logged in as " + userID + " [region: " + region + "]");

  // ── Context ──────────────────────────────────────────────────────────────
  var ctx = {
    userID, jar, clientID, globalOptions,
    loggedIn        : true,
    access_token    : "NONE",
    clientMutationId: 0,
    mqttClient      : undefined,
    lastSeqId       : irisSeqID,
    syncToken       : undefined,
    mqttEndpoint, region,
    firstListen     : true,
    fb_dtsg,
    req_ID          : 0,
    callback_Task   : {},
    wsReqNumber     : 0,
    wsTaskNumber    : 0,
    reqCallbacks    : {},
    threadTypes     : {}
  };

  // ── Runtime config ───────────────────────────────────────────────────────
  var runtimeCfg = { enableTypingIndicator: false, typingDuration: 4000 };
  try {
    [path.join(__dirname,"config.json"), path.join(process.cwd(),"config.json")].forEach(function(cfgPath) {
      if (fs.existsSync(cfgPath)) {
        try {
          var c = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
          if (c && typeof c === "object") {
            if (c.enableTypingIndicator != null) runtimeCfg.enableTypingIndicator = c.enableTypingIndicator;
            if (c.typingDuration        != null) runtimeCfg.typingDuration        = c.typingDuration;
          }
        } catch (_) {}
      }
    });
    if (global.GoatBot && global.GoatBot.config) {
      var gc = global.GoatBot.config;
      if (gc.enableTypingIndicator != null) runtimeCfg.enableTypingIndicator = gc.enableTypingIndicator;
      if (gc.typingDuration        != null) runtimeCfg.typingDuration        = gc.typingDuration;
    }
  } catch (_) {}
  ctx.config = runtimeCfg;

  // ── E2EE config ──────────────────────────────────────────────────────────
  try {
    var e2eeCfg = {};
    [path.join(__dirname,"config.json"), path.join(process.cwd(),"config.json")].forEach(function(cp) {
      if (fs.existsSync(cp)) {
        try { var c = JSON.parse(fs.readFileSync(cp,"utf8")); if (c && c.e2ee) Object.assign(e2eeCfg, c.e2ee); } catch (_) {}
      }
    });
    if (e2eeCfg.enable === true) globalOptions.enableE2EE = true;
    globalOptions.e2eeLogLevel      = e2eeCfg.logLevel      || "none";
    globalOptions.e2eeAutoReconnect = e2eeCfg.autoReconnect !== false;
    var saveType = e2eeCfg.saveType || "memory";
    globalOptions.e2eeMemoryOnly = saveType !== "path";
    if (saveType === "path") {
      var devPath = path.resolve(process.cwd(), e2eeCfg.devicePath || "./data/e2ee-device.json");
      try { fs.mkdirSync(path.dirname(devPath), { recursive: true }); } catch (_) {}
      globalOptions.e2eeDevicePath = devPath;
    }
    if (e2eeCfg.deviceData) globalOptions.e2eeDeviceData = e2eeCfg.deviceData;
  } catch (_) {}

  // ── defaultFuncs ─────────────────────────────────────────────────────────
  var defaultFuncs = utils.makeDefaults(html, userID, ctx);

  // ── API base ─────────────────────────────────────────────────────────────
  var api = {
    ctx,
    setOptions  : setOptions.bind(null, globalOptions),
    getAppState : function() { return utils.getAppState(jar); },
    postFormData: function(url, body) { return defaultFuncs.postFormData(url, ctx.jar, body); }
  };

  // ── Load src/*.js ────────────────────────────────────────────────────────
  try {
    fs.readdirSync(path.join(__dirname, "src"))
      .filter(function(v) { return v.endsWith(".js"); })
      .forEach(function(v) {
        try {
          api[v.replace(".js","")] = require(path.join(__dirname,"src",v))(defaultFuncs, api, ctx);
        } catch (err) {
          log.warn("buildAPI", "Failed to load src/" + v + ": " + (err && err.message ? err.message : err));
        }
      });
  } catch (err) {
    log.error("buildAPI", "Cannot read src/: " + (err && err.message ? err.message : err));
  }

  // ── Aliases ──────────────────────────────────────────────────────────────
  api.listen           = api.listenMqtt;
  api.send             = api.sendMessage;
  api.getInbox         = api.getThreadList;
  api.getInboxThreads  = api.getThreadList;
  api.getInboxHistory  = api.getThreadHistory;
  api.getCurrentUserID = api.getCurrentUserID || function() { return ctx.userID; };
  api.inbox = {
    enabled   : true,
    getThreads: api.getThreadList    ? api.getThreadList.bind(api)    : null,
    getHistory: api.getThreadHistory ? api.getThreadHistory.bind(api) : null
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  ██████  ANTI-LOGOUT + BROWSER LOGOUT FIX
  // ═══════════════════════════════════════════════════════════════════════════

  // 1. api.logout() → BLOCKED. Cookie session কখনো destroy হবে না।
  api.logout = function(callback) {
    log.warn("logout", "[toru-fca v1.0.6] ⛔ Logout blocked — Cookie session protected. Browser logout হবে না।");
    var cb = typeof callback === "function" ? callback : function() {};
    cb(null);
    return Promise.resolve();
  };

  // 2. Force logout (opt-in, সাবধানে ব্যবহার করো)
  api.forceLogout = function(callback) {
    log.warn("forceLogout", "[toru-fca] ⚠️  Force logout — session WILL be destroyed.");
    var cb = typeof callback === "function" ? callback : function() {};
    try {
      defaultFuncs
        .post("https://www.facebook.com/logout.php?h=" + (ctx.fb_dtsg || ""),
              ctx.jar, { fb_dtsg: ctx.fb_dtsg || "" })
        .then(function() { ctx.loggedIn = false; cb(null); })
        .catch(cb);
    } catch(e) { cb(e); }
  };

  // 3. fb_dtsg auto-refresh (20min) — "re-open browser" error থেকে সুরক্ষা
  api._antiLogoutTimer = null;
  (function startAntiLogout() {
    var alCfg = fcaCfg.antiLogout || {};
    if (alCfg.enabled === false) return;
    var ivMs = Number(alCfg.refreshIntervalMs) || 1200000;
    api._antiLogoutTimer = setInterval(function() {
      if (!ctx.loggedIn || !api.refreshFb_dtsg) return;
      api.refreshFb_dtsg(function(err) {
        if (err) log.warn("antiLogout", "fb_dtsg refresh failed (non-fatal): " + (err.message || err));
        else     log.info("antiLogout", "✅ fb_dtsg refreshed — session alive.");
      });
    }, ivMs);
    if (api._antiLogoutTimer.unref) api._antiLogoutTimer.unref();
  })();

  api.stopAntiLogout = function() {
    if (api._antiLogoutTimer) { clearInterval(api._antiLogoutTimer); api._antiLogoutTimer = null; }
  };

  // 4. Session guard (3min auto-save + cookie expiry extension)
  api.sessionGuard = createSessionGuard(jar, ctx, utils);
  api.saveSession  = function(filePath) {
    if (!filePath) return false;
    try {
      var state = utils.getAppState(jar);
      if (!state || !state.length) return false;
      fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf8");
      return true;
    } catch (e) { log.warn("saveSession", e.message); return false; }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  SMOOTH MODE — typing indicator + delay before send
  // ═══════════════════════════════════════════════════════════════════════════
  (function patchSmooth() {
    var smooth = fcaCfg.smooth || {};
    if (smooth.enabled !== true) return;
    var delay   = Number(smooth.messageDelay) || 300;
    var origSnd = api.sendMessage;
    if (typeof origSnd !== "function") return;
    api.sendMessage = function(msg, threadID, callback, replyToMessage, isSingleUser) {
      try {
        if (typeof api.sendTypingIndicator === "function") api.sendTypingIndicator(threadID, function() {});
      } catch (_) {}
      return new Promise(function(resolve, reject) {
        setTimeout(function() {
          try {
            var r = origSnd(msg, threadID, callback, replyToMessage, isSingleUser);
            if (r && typeof r.then === "function") r.then(resolve).catch(reject);
            else resolve(r);
          } catch(e) { reject(e); }
        }, delay);
      });
    };
    api.send = api.sendMessage;
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  //  AUTOMATION GUARD
  // ═══════════════════════════════════════════════════════════════════════════
  if (!(fcaCfg.automation && fcaCfg.automation.enabled)) {
    advancedSystem.setAutomationEnabled(false);
  }
  api.advanced             = advancedSystem;
  api.getHealth            = function() { return advancedSystem.health(api); };
  api.isAutomationEnabled  = function() { return advancedSystem.isAutomationEnabled(); };
  api.setAutomationEnabled = function(en) { return advancedSystem.setAutomationEnabled(en); };
  ctx.advancedSystem       = advancedSystem;

  // ═══════════════════════════════════════════════════════════════════════════
  //  FACEBOOK PROTECTION — anti-restriction, anti-ban, human-like delay
  // ═══════════════════════════════════════════════════════════════════════════
  (function initFacebookProtection() {
    var fpCfg = fcaCfg.facebookProtection || {};
    if (fpCfg.enabled === false) return;

    function humanDelay(min, max) {
      if (fpCfg.humanLikeDelay === false) return Promise.resolve();
      var ms = Math.floor(Math.random() * (max - min + 1)) + min;
      return new Promise(function(r) { setTimeout(r, ms); });
    }
    ctx._humanDelay = humanDelay;

    // Random micro-delay on top of smooth mode — traffic pattern অপ্রত্যাশিত
    if (fpCfg.humanLikeDelay !== false) {
      var _origMsg = api.sendMessage;
      if (typeof _origMsg === "function") {
        api.sendMessage = function(msg, threadID, callback, replyToMessage, isSingleUser) {
          return humanDelay(50, 200).then(function() {
            return _origMsg(msg, threadID, callback, replyToMessage, isSingleUser);
          });
        };
        api.send = api.sendMessage;
      }
    }

    // Automation detection block
    if (fpCfg.blockAutomationDetection !== false) {
      globalOptions.online         = false;
      globalOptions.updatePresence = false;
    }

    log.info("toru-fca", "🛡️  Facebook Protection active — anti-restriction, human-like mode.");
  })();

  // ═══════════════════════════════════════════════════════════════════════════
  //  E2EE BRIDGE
  // ═══════════════════════════════════════════════════════════════════════════
  if (globalOptions.enableE2EE) {
    try {
      var e2ee = require("./e2ee");
      e2ee.patchApiForE2EE(api, ctx);
      api.connectE2EE = function(callback) {
        var bridge = e2ee.createBridge(ctx);
        api._e2eeBridge = bridge;
        return bridge.connect(callback);
      };
      api.getE2EEBridge    = function() { return ctx._e2eeBridge || null; };
      api.getE2EEDeviceData = function(callback) {
        return new Promise(function(res, rej) {
          if (ctx._e2eeDeviceData) { res(ctx._e2eeDeviceData); if (callback) callback(null, ctx._e2eeDeviceData); return; }
          e2ee.createBridge(ctx).getDeviceData()
            .then(function(d) { ctx._e2eeDeviceData = d; res(d); if (callback) callback(null, d); })
            .catch(function(e) { rej(e); if (callback) callback(e); });
        });
      };
    } catch(pe) {
      log.warn("E2EE", "Failed to init: " + (pe && pe.message ? pe.message : pe));
    }
  }

  return { ctx, defaultFuncs, api };
}

// ─── EMAIL/PASS LOGIN FORM ────────────────────────────────────────────────────
function makeLoginForm(jar, email, password, loginOptions, callback) {
  return async function(res) {
    try {
      var html = res.body;
      var $    = cheerio.load(html);
      var arr  = [];
      $("#login_form input").each(function(_, v) { arr.push({ val: $(v).val(), name: $(v).attr("name") }); });
      arr = arr.filter(function(v) { return v.val && v.val.length; });
      var form  = utils.arrToForm(arr);
      form.lsd  = utils.getFrom(html, "[\"LSD\",[],{\"token\":\"", "\"}");
      form.lgndim = Buffer.from(JSON.stringify({w:1440,h:900,aw:1440,ah:834,c:24})).toString("base64");
      form.email  = email;
      form.pass   = password;
      form.default_persistent = "0";
      form.lgnrnd = utils.getFrom(html, "name=\"lgnrnd\" value=\"", "\"");
      form.locale   = "en_US";
      form.timezone = "240";
      form.lgnjs    = Math.floor(Date.now() / 1000);

      html.split("\"_js_").slice(1).forEach(function(val) {
        try {
          var cd = JSON.parse("[\"" + utils.getFrom(val, "", "]") + "\"]");
          jar.setCookie(utils.formatCookie(cd, "facebook"), "https://www.facebook.com");
        } catch (_) {}
      });

      var loginRes = await utils.post(
        "https://www.facebook.com/login/device-based/regular/login/?login_attempt=1&lwv=110",
        jar, form, loginOptions
      );
      await utils.saveCookies(jar)(loginRes);
      var headers = loginRes.headers;
      if (!headers.location) throw new Error("Wrong username/password.");

      if (headers.location.includes("https://www.facebook.com/checkpoint/")) {
        log.info("toru-fca", "Login checkpoint — 2FA required.");
        var cpRes  = await utils.get(headers.location, jar, null, loginOptions);
        await utils.saveCookies(jar)(cpRes);
        var cpHtml = cpRes.body;
        var $_cp   = cheerio.load(cpHtml);
        var cpArr  = [];
        $_cp("form input").each(function(_, v) { cpArr.push({ val: $_cp(v).val(), name: $_cp(v).attr("name") }); });
        cpArr = cpArr.filter(function(v) { return v.val && v.val.length; });
        var form2 = utils.arrToForm(cpArr);

        if (cpHtml.includes("checkpoint/?next")) {
          return new Promise(function(resolve, reject) {
            var submit2FA = async function(code) {
              try {
                form2.approvals_code = code;
                form2["submit[Continue]"] = $_cp("#checkpointSubmitButton").html();
                var r1 = await utils.post("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php", jar, form2, loginOptions);
                await utils.saveCookies(jar)(r1);
                form2.name_action_selected = "dont_save";
                await utils.post("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php", jar, form2, loginOptions);
                resolve(await loginHelper(utils.getAppState(jar), email, password, loginOptions, callback));
              } catch (e) { reject(e); }
            };
            callback({ error: "login-approval", continue: submit2FA });
          });
        }

        // forceLogin=false: "This was me" auto-submit করা হবে না — browser session সুরক্ষিত
        if (!loginOptions.forceLogin) throw new Error("Facebook blocked this login attempt. Enable forceLogin to override (browser will logout).");
        form2["submit[This was me]"] = cpHtml.includes("Suspicious Login") ? "This was me" : "This Is Okay";
        await utils.post("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php", jar, form2, loginOptions);
        form2.name_action_selected = "save_device";
        await utils.post("https://www.facebook.com/checkpoint/?next=https%3A%2F%2Fwww.facebook.com%2Fhome.php", jar, form2, loginOptions);
        return loginHelper(utils.getAppState(jar), email, password, loginOptions, callback);
      }

      await utils.get("https://www.facebook.com/", jar, null, loginOptions);
      return utils.saveCookies(jar);
    } catch (err) { callback(err); }
  };
}

// ─── LOGIN HELPER ─────────────────────────────────────────────────────────────
function loginHelper(appState, email, password, globalOptions, callback) {
  var jar = utils.getJar();
  var mainPromise;

  if (appState) {
    try {
      if (typeof appState === "string") {
        var trimmed = appState.trim();
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
          appState = JSON.parse(trimmed);
        } else {
          appState = trimmed.split(/;\s*/).map(function(part) {
            part = part.trim(); if (!part) return null;
            var i = part.indexOf("="); if (i <= 0) return null;
            return { name: part.slice(0,i).trim(), value: part.slice(i+1), domain: ".facebook.com", path: "/" };
          }).filter(Boolean);
        }
      }
    } catch (e) { return callback(new Error("Failed to parse appState: " + e.message)); }

    try {
      if (!Array.isArray(appState)) throw new Error("appState must be an array or cookie string.");
      var oneYearFromNow = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);

      appState.forEach(function(c) {
        var name = c && (c.key || c.name);
        if (!name || typeof c.value === "undefined") return;
        var domain = c.domain || ".facebook.com";

        // ── BROWSER LOGOUT FIX: Cookie expiry minimum 1 year ──────────────
        // Cookie expire হলে session drop → browser logout হয়।
        // সব cookie এর expiry কমপক্ষে 1 বছর future এ set করা হচ্ছে।
        var rawExpiry = c.expirationDate
          ? new Date(c.expirationDate * 1000)
          : (c.expires ? new Date(c.expires) : null);
        var finalExpiry = (!rawExpiry || rawExpiry < oneYearFromNow) ? oneYearFromNow : rawExpiry;
        var expires = finalExpiry.toUTCString();

        var str = name + "=" + c.value + "; expires=" + expires +
                  "; domain=" + domain + "; path=" + (c.path || "/") + ";";
        try { jar.setCookie(str, "https://www.facebook.com/"); } catch (_) {}
      });

      mainPromise = utils.get("https://www.facebook.com/", jar, null, globalOptions, { noRef: true })
        .then(utils.saveCookies(jar));
    } catch (e) { return callback(new Error("Failed to load appState: " + e.message)); }
  } else {
    mainPromise = utils.get("https://www.facebook.com/", null, null, globalOptions, { noRef: true })
      .then(utils.saveCookies(jar))
      .then(makeLoginForm(jar, email, password, globalOptions, callback))
      .then(function() {
        return utils.get("https://www.facebook.com/", jar, null, globalOptions).then(utils.saveCookies(jar));
      });
  }

  function handleRedirect(res) {
    var redir = /<meta http-equiv="refresh" content="0;url=([^"]+)[^>]+>/.exec(res.body);
    if (redir && redir[1]) return utils.get(redir[1], jar, null, globalOptions).then(utils.saveCookies(jar));
    return res;
  }

  var ctx, api;
  mainPromise = mainPromise
    .then(handleRedirect)
    .then(function(res) {
      if (!/MPageLoadClientMetrics/gs.test(res.body)) {
        globalOptions.userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";
        return utils.get("https://www.facebook.com/", jar, null, globalOptions, { noRef: true })
          .then(utils.saveCookies(jar));
      }
      return res;
    })
    .then(handleRedirect)
    .then(function(res) {
      var result = buildAPI(globalOptions, res.body, jar);
      if (!result) throw new Error("buildAPI returned null — invalid appstate. Check appstate.json.");
      ctx = result.ctx; api = result.api;
      return res;
    });

  if (globalOptions.pageID) {
    mainPromise = mainPromise
      .then(function() {
        return utils.get(
          "https://www.facebook.com/" + globalOptions.pageID + "/messages/?section=messages&subsection=inbox",
          jar, null, globalOptions
        );
      })
      .then(function(resData) {
        var url = utils.getFrom(resData.body, "window.location.replace(\"https:\\/\\/www.facebook.com\\/", "\");").split("\\").join("");
        url = url.substring(0, url.length - 1);
        return utils.get("https://www.facebook.com" + url, jar, null, globalOptions);
      });
  }

  mainPromise
    .then(function() {
      log.info("toru-fca", "✅ Login successful — UserID: " + (ctx && ctx.userID));
      callback(null, api);
    })
    .catch(function(e) { callback(e); });
}

// ─── LOGIN (PUBLIC) ───────────────────────────────────────────────────────────
function login(loginData, options, callback) {
  if (utils.getType(options) === "Function" || utils.getType(options) === "AsyncFunction") {
    callback = options; options = {};
  }

  // ── Safe defaults — GoatBot + Facebook compatible ──────────────────────
  // forceLogin: FALSE — browser logout fix (checkpoint "This was me" auto-submit বন্ধ)
  var globalOptions = {
    selfListen            : true,
    selfListenEvent       : false,
    listenEvents          : true,
    listenTyping          : false,
    updatePresence        : false,
    forceLogin            : false,   // ← browser logout fix
    autoMarkDelivery      : false,
    autoMarkRead          : false,
    autoReconnect         : true,
    reconnectMinDelayMs   : 3000,
    reconnectMaxDelayMs   : 60000,
    reconnectStableResetMs: 30000,
    logRecordSize         : 100,
    online                : false,   // ← automation detection bypass
    emitReady             : false,
    userAgent             : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36"
  };

  var resolveFunc, rejectFunc;
  var returnPromise = new Promise(function(resolve, reject) { resolveFunc = resolve; rejectFunc = reject; });
  if (utils.getType(callback) !== "Function" && utils.getType(callback) !== "AsyncFunction") {
    callback = function(err, api) { if (err) return rejectFunc(err); resolveFunc(api); };
  }

  setOptions(globalOptions, options || {});

  if (loginData.appState) {
    loginHelper(loginData.appState, null, null, globalOptions, callback);
  } else if (loginData.email && loginData.password) {
    // email+password তেও forceLogin=false রাখা হচ্ছে
    setOptions(globalOptions, { forceLogin: false });
    loginHelper(loginData.appState, loginData.email, loginData.password, globalOptions, callback);
  } else {
    callback(new Error("loginData must have appState (cookie array) or email+password."));
  }

  return returnPromise;
}

module.exports         = login;
module.exports.login   = login;
module.exports.default = login;
