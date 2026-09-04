"use strict";
var log = require("npmlog");

/**
 * toru-fca v1.0.6 — src/logout.js
 *
 * এই file টা index.js এ override হয়ে যায়।
 * api.logout() সরাসরি no-op — session destroy হবে না।
 * Force logout করতে: api.forceLogout()
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function logout(callback) {
    log.warn("logout", "[toru-fca v1.0.6] ⛔ Logout blocked — use api.forceLogout() to override.");
    var cb = typeof callback === "function" ? callback : function () {};
    cb(null);
    return Promise.resolve();
  };
};
