"use strict";

var log = require("npmlog");

module.exports = function (defaultFuncs, api, ctx) {
  return function stopListenMqtt() {
    // Guard: if already stopped or never started, silently return instead of throwing.
    if (!ctx.mqttClient) {
      log.warn("stopListenMqtt", "MQTT client is not active; nothing to stop.");
      return;
    }

    log.info("stopListenMqtt", "Stopping MQTT listener...");

    // Halt any pending auto-reconnect so the close event does not trigger a new attempt.
    if (ctx._reconnectState) {
      ctx._reconnectState.stopped = true;
      if (ctx._reconnectState.timer) {
        clearTimeout(ctx._reconnectState.timer);
        ctx._reconnectState.timer = null;
      }
    }

    // Graceful teardown: unsubscribe from real-time topics, signal browser close,
    // then end the connection. Wrap each call so a partially-closed client cannot
    // throw and leave the bot in a broken state.
    try { ctx.mqttClient.unsubscribe("/webrtc"); }    catch (_) {}
    try { ctx.mqttClient.unsubscribe("/rtc_multi"); } catch (_) {}
    try { ctx.mqttClient.unsubscribe("/onevc"); }     catch (_) {}
    try { ctx.mqttClient.publish("/browser_close", "{}"); } catch (_) {}

    ctx.mqttClient.end(false, function () {
      log.info("stopListenMqtt", "MQTT listener stopped.");
      ctx.mqttClient = null;
    });
  };
};
