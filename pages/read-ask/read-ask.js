// pages/read-ask/read-ask.js - 待读知识库智能问答（个人维度 RAG，多轮 + 流式 + 会话管理）
var api = require('../../utils/api');

var MSG_ID = 0;
function nextId() { MSG_ID += 1; return 'm' + Date.now() + '_' + MSG_ID; }

var SESSION_KEY = 'read_ask_sessions_v1';
var CURRENT_KEY = 'read_ask_current_v1';
var LEGACY_KEY = 'read_ask_history_v1'; // v0.21 单会话历史，首次进入迁移
var MAX_SESSIONS = 20;   // 本地最多保留会话数
var MAX_MSGS = 60;       // 每会话最多消息条数
var MAX_TURN_HISTORY = 6; // 每次请求携带的历史条数（服务端还会再裁）

function pad2(n) { return (n < 10 ? '0' : '') + n; }
function timeText(ts) {
  var d = new Date(ts);
  var now = new Date();
  var hm = pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()) return hm;
  return pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + hm;
}

function firstUserText(msgs) {
  for (var i = 0; i < (msgs || []).length; i++) {
    if (msgs[i].role === 'user' && msgs[i].text) return msgs[i].text;
  }
  return '';
}

/** 规范化消息：未完成的流式消息补「已中断」，避免恢复后一直转圈 */
function normalizeMsgs(msgs) {
  return (msgs || []).map(function (m) {
    if (m.role === 'ai' && m.streaming) {
      return {
        id: m.id, role: 'ai',
        text: m.text || '（回答中断了，可重新提问）',
        sources: m.sources || [], streaming: false, interrupted: !m.text
      };
    }
    return m;
  });
}

function loadSessions() {
  try {
    var arr = wx.getStorageSync(SESSION_KEY);
    if (Array.isArray(arr) && arr.length) return arr;
  } catch (e) { /* ignore */ }
  // 旧版单会话历史迁移
  try {
    var legacy = wx.getStorageSync(LEGACY_KEY);
    if (Array.isArray(legacy) && legacy.length) {
      var s = { id: 's' + Date.now(), title: firstUserText(legacy), updatedAt: Date.now(), messages: legacy };
      try { wx.removeStorageSync(LEGACY_KEY); } catch (e2) { /* ignore */ }
      return [s];
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveSessions(sessions) {
  try { wx.setStorageSync(SESSION_KEY, (sessions || []).slice(0, MAX_SESSIONS)); } catch (e) { /* ignore */ }
}

function toApiHistory(messages) {
  return messages
    .filter(function (m) { return (m.role === 'user' || m.role === 'ai') && m.text && !m.error; })
    .map(function (m) { return { role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }; })
    .slice(-MAX_TURN_HISTORY);
}

/** 会话列表条目（供面板渲染的派生摘要） */
function summarize(s) {
  var userCount = 0;
  (s.messages || []).forEach(function (m) { if (m.role === 'user') userCount++; });
  return { id: s.id, title: s.title || '新对话', count: userCount, timeText: timeText(s.updatedAt || 0) };
}

Page({
  data: {
    suggestions: [
      '用几句话总结一下我收藏了哪些内容',
      '知识库里关于 AI 的文章都讲了什么？',
      '对比一下库里几篇文章的观点差异'
    ],
    messages: [],
    input: '',
    canSend: false,
    sending: false,
    elapsed: 0,      // 本轮已等待秒数
    scrollInto: '',
    showSessions: false,
    sessions: [],    // 面板渲染用摘要列表
    currentId: ''
  },

  onLoad: function () {
    var sessions = loadSessions();
    var curId = '';
    try { curId = wx.getStorageSync(CURRENT_KEY) || ''; } catch (e) { /* ignore */ }
    var cur = null;
    for (var i = 0; i < sessions.length; i++) if (sessions[i].id === curId) cur = sessions[i];
    if (!cur && sessions.length) cur = sessions[0]; // 恢复最近一次对话
    this._sessions = sessions;
    this.setData({
      messages: cur ? cur.messages : [],
      currentId: cur ? cur.id : '',
      sessions: sessions.map(summarize)
    });
    if (cur && cur.messages.length) {
      var that = this;
      setTimeout(function () { that.setData({ scrollInto: 'qa-bottom' }); }, 200);
    }
  },

  onHide: function () { this.flushCurrent(); },

  onUnload: function () {
    if (this._task && this._task.abort) { try { this._task.abort(); } catch (e) { /* ignore */ } }
    this.flushCurrent();
    this.stopTimer();
  },

  /** 把当前对话落盘（upsert 进会话列表并持久化） */
  flushCurrent: function () {
    var msgs = normalizeMsgs(this.data.messages);
    if (!msgs.length) return;
    if (msgs.length > MAX_MSGS) msgs = msgs.slice(-MAX_MSGS);
    var sessions = this._sessions || [];
    var id = this.data.currentId || ('s' + Date.now());
    var now = Date.now();
    var found = false;
    for (var i = 0; i < sessions.length; i++) {
      if (sessions[i].id === id) {
        sessions[i].messages = msgs;
        sessions[i].updatedAt = now;
        if (!sessions[i].title && firstUserText(msgs)) sessions[i].title = firstUserText(msgs);
        found = true;
        break;
      }
    }
    if (!found) {
      sessions.unshift({ id: id, title: (firstUserText(msgs) || '新对话').slice(0, 30), updatedAt: now, messages: msgs });
      if (sessions.length > MAX_SESSIONS) sessions = sessions.slice(0, MAX_SESSIONS);
    }
    this._sessions = sessions;
    this.setData({ currentId: id, sessions: sessions.map(summarize) });
    saveSessions(sessions);
    try { wx.setStorageSync(CURRENT_KEY, id); } catch (e) { /* ignore */ }
  },

  /* ---------------- 对话管理 ---------------- */

  onOpenSessions: function () {
    this.flushCurrent();
    this.setData({ showSessions: true, sessions: (this._sessions || []).map(summarize) });
  },

  onCloseSessions: function () { this.setData({ showSessions: false }); },

  onStopPropagation: function () { /* 阻止蒙层点击穿透 */ },

  onNewSession: function () {
    if (this.data.sending) return;
    this.flushCurrent(); // 当前对话先保存
    this.setData({ messages: [], currentId: '', showSessions: false, scrollInto: '' });
    try { wx.removeStorageSync(CURRENT_KEY); } catch (e) { /* ignore */ }
  },

  onSwitchSession: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id || this.data.sending) return;
    this.flushCurrent();
    var target = null;
    (this._sessions || []).forEach(function (s) { if (s.id === id) target = s; });
    if (!target) return;
    this.setData({ messages: target.messages, currentId: id, showSessions: false });
    try { wx.setStorageSync(CURRENT_KEY, id); } catch (e2) { /* ignore */ }
    var that = this;
    setTimeout(function () { that.setData({ scrollInto: 'qa-bottom' }); }, 120);
  },

  onDeleteSession: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id || this.data.sending) return;
    var that = this;
    wx.showModal({
      title: '删除对话',
      content: '删除后该对话记录不可恢复（不影响已收藏的文章）。',
      confirmText: '删除',
      success: function (res) {
        if (!res.confirm) return;
        that._sessions = (that._sessions || []).filter(function (s) { return s.id !== id; });
        saveSessions(that._sessions);
        var patch = { sessions: that._sessions.map(summarize) };
        if (that.data.currentId === id) {
          patch.currentId = '';
          patch.messages = [];
          try { wx.removeStorageSync(CURRENT_KEY); } catch (e2) { /* ignore */ }
        }
        that.setData(patch);
      }
    });
  },

  onClearHistory: function () {
    var that = this;
    wx.showModal({
      title: '清空当前对话',
      content: '只清空当前对话的消息（其他对话保留，不影响已收藏的文章）。',
      confirmText: '清空',
      success: function (res) {
        if (!res.confirm) return;
        that.setData({ messages: [], currentId: '', scrollInto: '' });
        try { wx.removeStorageSync(CURRENT_KEY); } catch (e) { /* ignore */ }
      }
    });
  },

  /* ---------------- 输入与发送 ---------------- */

  onInput: function (e) {
    var v = e.detail.value || '';
    this.setData({ input: v, canSend: !!v.trim() });
  },

  onSuggestTap: function (e) {
    var q = e.currentTarget.dataset.q || '';
    if (!q || this.data.sending) return;
    this.setData({ input: q, canSend: true });
    this.onSend();
  },

  // 消息更新后滚动到底
  scrollBottom: function () {
    var that = this;
    setTimeout(function () { that.setData({ scrollInto: 'qa-bottom' }); }, 80);
  },

  // 更新最后一条 AI 消息（流式期间反复调用，用定向路径 setData）
  patchLastAi: function (patch) {
    var msgs = this.data.messages;
    for (var i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === 'ai') {
        var upd = {};
        var keys = Object.keys(patch);
        for (var k = 0; k < keys.length; k++) {
          upd['messages[' + i + '].' + keys[k]] = patch[keys[k]];
        }
        this.setData(upd);
        return;
      }
    }
  },

  startTimer: function () {
    var that = this;
    this._startedAt = Date.now();
    this.setData({ elapsed: 0 });
    this.stopTimer();
    this._timer = setInterval(function () {
      that.setData({ elapsed: Math.floor((Date.now() - that._startedAt) / 1000) });
    }, 1000);
  },

  stopTimer: function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },

  onSend: function () {
    var question = (this.data.input || '').trim();
    if (!question || this.data.sending) return;
    var that = this;
    var history = toApiHistory(this.data.messages);

    var userMsg = { id: nextId(), role: 'user', text: question };
    var aiMsg = { id: nextId(), role: 'ai', text: '', sources: [], streaming: true };
    this.setData({
      messages: this.data.messages.concat([userMsg, aiMsg]),
      input: '',
      canSend: false,
      sending: true,
      scrollInto: 'qa-bottom'
    });
    this.flushCurrent(); // 用户消息立即落盘，中途退出也不丢
    this.startTimer();
    this.scrollBottom();

    var finalize = function (r) {
      that.stopTimer();
      that.patchLastAi({
        text: (r && r.answer) || '（空回答）',
        streaming: false,
        sources: ((r && r.sources) || []).map(function (s) {
          return { no: s.no, id: s.id, title: s.title, platformLabel: s.platformLabel };
        }),
        extractive: !!(r && r.extractive),
        refused: !!(r && r.refused)
      });
      that.setData({ sending: false, elapsed: 0 });
      that.flushCurrent();
      that.scrollBottom();
    };
    var failMsg = function (text) {
      that.stopTimer();
      that.patchLastAi({ text: text, streaming: false, sources: [], error: true });
      that.setData({ sending: false, elapsed: 0 });
      that.flushCurrent();
      that.scrollBottom();
    };

    // 流式优先；不支持/失败回退非流式
    var gotDelta = false;
    this._task = api.readAskStream(question, history, function (ev, d) {
      if (ev === 'delta' && d && typeof d.full === 'string') {
        gotDelta = true;
        that.patchLastAi({ text: d.full });
        that.scrollBottom();
      } else if (ev === 'done' && d) {
        finalize(d);
      } else if (ev === 'error' && d) {
        failMsg('回答失败了：' + (d.error || '未知错误') + '，请稍后重试。');
      }
    }, function (err) {
      if (gotDelta) {
        failMsg('回答中断了，请重试。');
        return;
      }
      // 回退非流式（环境不支持 chunked 或请求级失败）
      api.readAskMulti(question, history, function (data) { finalize(data); }, function () {
        failMsg('回答请求失败了，请稍后重试。');
      });
    });
  },

  onSourceTap: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: '/pages/read-detail/read-detail?id=' + id });
  },

  onCopy: function (e) {
    var text = e.currentTarget.dataset.text || '';
    if (!text) return;
    wx.setClipboardData({ data: text });
  }
});
