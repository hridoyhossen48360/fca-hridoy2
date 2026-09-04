"use strict";
const CURRENT_VERSION = "1.0.6";

async function checkForFCAUpdate() {
  try {
    const https = require("https");
    const data  = await new Promise((resolve) => {
      const req = https.get("https://registry.npmjs.org/toru-fca/latest", { timeout: 5000 }, (res) => {
        let body = "";
        res.on("data", (c) => { body += c; });
        res.on("end", () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
      });
      req.on("error", () => resolve(null));
      req.on("timeout", () => { req.destroy(); resolve(null); });
    });
    if (data && data.version && data.version !== CURRENT_VERSION) {
      const log = require("npmlog");
      log.warn("toru-fca", "Update available: v" + CURRENT_VERSION + " → v" + data.version + " — npm update toru-fca");
    }
  } catch (_) {}
}

module.exports = { checkForFCAUpdate, CURRENT_VERSION };
