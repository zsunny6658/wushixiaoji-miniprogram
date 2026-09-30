/**
 * 小程序 SSE 实时客户端（v0.12.2）
 *
 * 通过 wx.request enableChunked 接收服务端 /api/stream 推送，
 * 模块级单连接 + 引用计数；断线 5s 自动重连；解析 `data: {...}\n\n` 帧。
 *
 * 用法：
 *   var rt = require('../../utils/realtime');
 *   this._unsub = rt.subscribe(function (evt) { ... }); // evt = { type, ... }
 *   onUnload 时调用 this._unsub()
 */
var clients = [];       // 已注册的 handler
var statusClients = []; // 连接状态回调（'connected' / 'offline'）
var task = null;        // wx.RequestTask
var retryTimer = null;
var buf = '';           // 分帧缓冲
var destroyed = false;
var gotChunk = false;   // 本次连接是否已收到数据（用于判定 connected）

function decodeChunk(arrayBuffer) {
  var bytes = new Uint8Array(arrayBuffer);
  // 优先用 TextDecoder（部分基础库支持），否则手工 UTF-8 解码
  try {
    return new TextDecoder('utf-8').decode(bytes);
  } catch (e) {
    var out = '';
    var i = 0;
    while (i < bytes.length) {
      var b = bytes[i];
      var code;
      if (b < 0x80) { code = b; i += 1; }
      else if (b < 0xE0) { code = ((b & 0x1F) << 6) | (bytes[i + 1] & 0x3F); i += 2; }
      else if (b < 0xF0) { code = ((b & 0x0F) << 12) | ((bytes[i + 1] & 0x3F) << 6) | (bytes[i + 2] & 0x3F); i += 3; }
      else { code = ((b & 0x07) << 18) | ((bytes[i + 1] & 0x3F) << 12) | ((bytes[i + 2] & 0x3F) << 6) | (bytes[i + 3] & 0x3F); i += 4; }
      out += String.fromCharCode(code);
    }
    return out;
  }
}

function dispatch(event) {
  clients.forEach(function (fn) {
    try { fn(event); } catch (e) { /* 单个 handler 异常不影响其他 */ }
  });
}

function dispatchStatus(st) {
  statusClients.forEach(function (fn) {
    try { fn(st); } catch (e) { /* noop */ }
  });
}

function handleData(text) {
  var event = null;
  try { event = JSON.parse(text); } catch (e) { return; }
  if (event && event.type) dispatch(event);
}

function processBuffer() {
  var idx;
  while ((idx = buf.indexOf('\n\n')) >= 0) {
    var frame = buf.slice(0, idx);
    buf = buf.slice(idx + 2);
    var lines = frame.split('\n');
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.indexOf('data: ') === 0) handleData(line.slice(6));
      // ': ping' / ': connected' 注释行忽略
    }
  }
}

function connect() {
  if (task || !clients.length) return;
  var app = getApp();
  var baseUrl = (app && app.globalData && app.globalData.baseUrl) || '';
  var token = (app && app.globalData && app.globalData.token) || '';
  if (!baseUrl || !token) return;
  buf = '';
  destroyed = false;
  gotChunk = false;
  task = wx.request({
    url: baseUrl + '/api/stream?token=' + encodeURIComponent(token),
    method: 'GET',
    enableChunked: true,
    header: { Accept: 'text/event-stream' },
    success: function () { /* 正常断开（服务端关闭） */ dispatchStatus('offline'); scheduleRetry(); },
    fail: function () { dispatchStatus('offline'); scheduleRetry(); }
  });
  if (task && task.onChunkReceived) {
    task.onChunkReceived(function (res) {
      try {
        if (!gotChunk) { gotChunk = true; dispatchStatus('connected'); }
        buf += decodeChunk(res.data || res.arrayBuffer || new ArrayBuffer(0));
        processBuffer();
      } catch (e) { /* 忽略解析异常 */ }
    });
  }
}

function scheduleRetry() {
  if (destroyed || retryTimer) return;
  retryTimer = setTimeout(function () {
    retryTimer = null;
    task = null;
    if (clients.length) connect();
  }, 5000);
}

function closeTask() {
  if (!task) return;
  try {
    if (task.offChunkReceived) task.offChunkReceived(function () {});
    task.abort();
  } catch (e) { /* noop */ }
  task = null;
}

module.exports = {
  // 注册监听，返回解绑函数。同一事件会广播给所有 handler。
  // handler: (evt) => 业务事件；statusHandler: ('connected'|'offline') => 连接状态（可选）
  subscribe: function (handler, statusHandler) {
    clients.push(handler);
    if (statusHandler) statusClients.push(statusHandler);
    connect();
    var self = this;
    return function unsubscribe() {
      var i = clients.indexOf(handler);
      if (i >= 0) clients.splice(i, 1);
      if (statusHandler) {
        var j = statusClients.indexOf(statusHandler);
        if (j >= 0) statusClients.splice(j, 1);
      }
      if (!clients.length) {
        destroyed = true;
        closeTask();
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      }
    };
  }
};
