"use strict";
var log = require("npmlog");

/**
 * toru-fca v1.0.6 — refreshFb_dtsg.js
 * fb_dtsg token কে fresh করে — "re-open your browser" error থেকে সুরক্ষা।
 * antiLogout timer এটাকে হর 20 মিনিটে call করে।
 */
module.exports = function (defaultFuncs, api, ctx) {
  return function refreshFb_dtsg(callback) {
    var cb = typeof callback === "function" ? callback : function() {};
    defaultFuncs
      .get("https://www.facebook.com/", ctx.jar)
      .then(function(res) {
        var html = res.body || "";
        var patterns = [
          /\["DTSGInitialData",\[\],{"token":"([^"]+)"}\]/,
          /\["DTSGInitData",\[\],{"token":"([^"]+)"/,
          /"token":"([^"]+)"/,
          /name="fb_dtsg" value="([^"]+)"/,
          /"async_get_token":"([^"]+)"/,
          /"dtsg":\{"token":"([^"]+)"/
        ];
        var token = null;
        for (var i = 0; i < patterns.length; i++) {
          var m = html.match(patterns[i]);
          if (m && m[1]) { token = m[1]; break; }
        }
        if (token) {
          ctx.fb_dtsg = token;
          log.info("refreshFb_dtsg", "✅ fb_dtsg refreshed successfully.");
          cb(null, token);
        } else {
          log.warn("refreshFb_dtsg", "Could not extract fb_dtsg from page.");
          cb(new Error("fb_dtsg not found in page"));
        }
      })
      .catch(function(err) {
        log.warn("refreshFb_dtsg", "Request failed: " + (err && err.message ? err.message : err));
        cb(err);
      });
  };
};
