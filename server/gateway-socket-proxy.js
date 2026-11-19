// SERVER / GATEWAY-SOCKET-PROXY.JS
// Виртуальный WebSocket-прокси на стороне Zone Worker для прозрачной работы через MasterGateway IPC.
'use strict';

const EventEmitter = require('events');

function createGatewaySocketProxy(ctx) {
  const {
    getIpc,
    netStats,
    NPB,
    USE_NATIVE_BUFFER_IPC,
    getOutgoingBatch,
    flushGatewayBatch,
    scheduleBatchFlush,
    MSG_GATEWAY_CLOSE
  } = ctx;

  return class GatewaySocketProxy extends EventEmitter {
    constructor(connId, clientIp) {
      super();
      this.connId = connId;
      this.clientIp = clientIp || '';
      this.pid = null;
      this.readyState = 1; // 1 = OPEN
      this.bufferedAmount = 0;
      this.isProxy = true;
      this.isStressAllowed = false;
      this.stressKey = '';
    }

    send(data, options) {
      const ipc = getIpc();
      if (this.readyState !== 1 || !ipc) return;
      const isBin = (options && options.binary) || Buffer.isBuffer(data) || (data instanceof ArrayBuffer);
      let outData = isBin && !Buffer.isBuffer(data) ? Buffer.from(data) : (isBin ? NPB.detachBuffer(data) : data);
      let isBase64 = false;
      if (isBin && Buffer.isBuffer(outData) && !USE_NATIVE_BUFFER_IPC) {
        outData = outData.toString('base64');
        isBase64 = true;
      }
      const batch = getOutgoingBatch();
      batch.push({
        connId: this.connId,
        pid: this.pid,
        data: outData,
        isBinary: !!isBin,
        isBase64: isBase64
      });
      if (batch.length >= 250) flushGatewayBatch();
      else scheduleBatchFlush();
    }

    close(code, reason) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      let c = code || 1000;
      if (c === 1005 || c === 1006) c = 4001;
      const ipc = getIpc();
      if (ipc) {
        ipc.sendToPrimary(MSG_GATEWAY_CLOSE, { connId: this.connId, code: c, reason: String(reason || '') });
      }
      process.nextTick(() => { this.emit('close', c, reason || ''); });
    }

    ping() { this.send(JSON.stringify({ t: 'ping', time: Date.now() })); }
    subscribe() { return false; }
    unsubscribe() { return false; }
    terminate() { this.close(4001, 'terminated'); }
  };
}

module.exports = { createGatewaySocketProxy };

