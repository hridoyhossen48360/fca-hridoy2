"use strict";
var log = require("npmlog");

/**
 * toru-fca v1.0.6 — sendTypingIndicatorV2.js
 * Bug fix: ctx.mqttClient reference ছিল undefined — এখন সঠিকভাবে reference করা হয়েছে।
 */
module.exports = function (defaultFuncs, api, ctx) {
  return async function sendTypingIndicatorV2(sendTyping, threadID, callback) {
    var mqttClient = ctx.mqttClient; // ← fix: ctx থেকে নেওয়া
    var cb = typeof callback === "function" ? callback : function() {};

    if (!mqttClient || !mqttClient.connected) {
      log.warn("sendTypingIndicatorV2", "MQTT not connected — skipping.");
      return cb(null); // non-fatal
    }

    var count_req = ctx.wsReqNumber != null ? ++ctx.wsReqNumber : 1;
    var tid = threadID ? threadID.toString() : "";
    var isGroup = tid.length >= 16 ? 1 : 0;

    var wsContent = {
      app_id: 2220391788200892,
      payload: JSON.stringify({
        label: 3,
        payload: JSON.stringify({
          thread_key: tid,
          is_group_thread: isGroup,
          is_typing: +sendTyping,
          attribution: 0
        }),
        version: 5849951561777440
      }),
      request_id: count_req,
      type: 4
    };

    try {
      await new Promise(function(resolve, reject) {
        mqttClient.publish("/ls_req", JSON.stringify(wsContent), {}, function(err) {
          if (err) return reject(err);
          resolve();
        });
      });
      cb(null);
    } catch (e) {
      log.warn("sendTypingIndicatorV2", "Failed: " + (e && e.message ? e.message : e));
      cb(e);
    }
  };
};
