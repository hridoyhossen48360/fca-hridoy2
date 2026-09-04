"use strict";

var utils = require("../utils");
// @NethWs3Dev

module.exports = function (defaultFuncs, api, ctx) {
	return async function sendTypingIndicatorV2(sendTyping, threadID, callback) {
		// ── sendTypingE2EE: route E2EE typing indicator through the bridge ──────
		if (ctx.globalOptions && ctx.globalOptions.enableE2EE) {
			var _e2eeMod = require('../e2ee');
			if (_e2eeMod.isE2EEChatJid(String(threadID))) {
				return _e2eeMod.createBridge(ctx).sendTyping(threadID, sendTyping !== false)
					.then(function (r) { if (typeof callback === 'function') callback(null, r); return r; })
					.catch(function (e) { if (typeof callback === 'function') callback(e); });
			}
		}
		// ── end sendTypingE2EE ────────────────────────────────────────────────────

		const mqttClient = ctx.mqttClient || global.mqttClient;
		if (!mqttClient) {
			if (typeof callback === 'function') callback(new Error('No MQTT client available for typing indicator'));
			return;
		}

		let count_req = 0;
		var wsContent = {
			app_id: 2220391788200892,
			payload: JSON.stringify({
				label: 3,
				payload: JSON.stringify({
					thread_key: threadID.toString(),
					is_group_thread: +(threadID.toString().length >= 16),
					is_typing: +sendTyping,
					attribution: 0
				}),
				version: 5849951561777440
			}),
			request_id: ++count_req,
			type: 4
		};

		return new Promise((resolve, reject) => {
			mqttClient.publish('/ls_req', JSON.stringify(wsContent), {}, (err, _packet) => {
				if (err) {
					if (typeof callback === 'function') callback(err);
					reject(err);
				} else {
					if (typeof callback === 'function') callback(null, _packet);
					resolve(_packet);
				}
			});
		});
	};
};
