"use strict";

/**
 * AdvancedSystem — minimal queue + health monitor for alpha-fca.
 * Automation is OFF by default. No background polling, no aggressive requests.
 * Only runs tasks you explicitly enqueue.
 */

const EventEmitter = require("events");

class AdvancedSystem extends EventEmitter {
  constructor(options) {
    super();
    options = options || {};
    this.options = Object.assign({
      automationEnabled: false,
      minDelayMs: 1000,
      maxDelayMs: 30000,
      maxQueue: 50
    }, options);
    this.startedAt = Date.now();
    this._queue = [];
    this._running = false;
    this._stats = { enqueued: 0, completed: 0, failed: 0 };
  }

  /** @returns {boolean} */
  isAutomationEnabled() {
    return this.options.automationEnabled === true;
  }

  /** Explicit opt-in only — no background automation started automatically. */
  setAutomationEnabled(enabled) {
    this.options.automationEnabled = Boolean(enabled);
    this.emit("automation", this.options.automationEnabled);
    return this.options.automationEnabled;
  }

  /** Health snapshot — safe to call anytime. */
  health(api) {
    const mqttClient = api && (api.mqttClient || (api.ctx && api.ctx.mqttClient));
    return {
      version: "1.0.0",
      uptimeMs: Date.now() - this.startedAt,
      automationEnabled: this.isAutomationEnabled(),
      inboxEnabled: true,
      mqtt: mqttClient ? {
        connected: Boolean(mqttClient.connected),
        reconnecting: Boolean(mqttClient.reconnecting)
      } : null,
      queue: { size: this._queue.length, running: this._running },
      stats: Object.assign({}, this._stats)
    };
  }

  /**
   * Enqueue a task function. Runs sequentially.
   * @param {Function} task  async () => result
   * @returns {Promise<any>}
   */
  enqueue(task) {
    if (typeof task !== "function") return Promise.reject(new TypeError("task must be a function"));
    if (this._queue.length >= this.options.maxQueue) {
      return Promise.reject(new Error("AdvancedSystem queue is full (" + this.options.maxQueue + ")"));
    }
    this._stats.enqueued++;
    return new Promise((resolve, reject) => {
      this._queue.push({ task, resolve, reject });
      this._drain();
    });
  }

  async _drain() {
    if (this._running || this._queue.length === 0) return;
    this._running = true;
    while (this._queue.length > 0) {
      const { task, resolve, reject } = this._queue.shift();
      try {
        const result = await task();
        this._stats.completed++;
        resolve(result);
      } catch (err) {
        this._stats.failed++;
        reject(err);
      }
      // Small throttle between tasks to avoid burst requests
      if (this._queue.length > 0) {
        await new Promise(r => setTimeout(r, this.options.minDelayMs));
      }
    }
    this._running = false;
  }
}

module.exports = AdvancedSystem;
