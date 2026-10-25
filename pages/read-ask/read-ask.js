// pages/read-ask/read-ask.js - 待读知识库问答（个人维度 RAG，多轮 + 流式 + 本地历史）
var api = require('../../utils/api');

var MSG_ID = 0;
function nextId() { MSG_ID += 1; return 'm' + Date.now() + '_' + MSG_ID; }
var STORE_KEY = 'read_ask_history_v1';
var MAX_STORE = 60;      // 本地最多保留消息条数
var MAX_TURN_HISTORY = 6; // 每次请求携带的历史条数（服务端还会再裁）

function loadHistory() {
  try {
    var arr = wx.getStorageSync(STORE_KEY);
    if (Array.isArray(arr) && arr.length) {
      arr.forEach(function () { MSG_ID += 1; }); // 推进 id 计数避免冲突
      return arr;
    }
  } catch (e) { /* ignore */ }
  return [];
}

function saveHistory(messages) {
  try {
    wx.setStorageSync(STORE_KEY, messages.slice(-MAX_STORE));
  } catch (e) { /* 存储失败不影响使用 */ }
}

function toApiHistory(messages) {
  return messages
    .filter(function (m) { return (m.role === 'user' || m.role === 'ai') && m.text && !m.error; })
    .map(function (m) { return { role: m.role === 'ai' ? 'assistant' : 'user', content: m.text }; })
    .slice(-MAX_TURN_HISTORY);
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
    scrollInto: ''
  },

  onLoad: function () {
    var msgs = loadHistory();
    this.setData({ messages: msgs });
    if (msgs.length) {
      var that = this;
      setTimeout(function () { that.setData({ scrollInto: 'qa-bottom' }); }, 200);
    }
  },

  onUnload: function () {
    if (this._task && this._task.abort) { try { this._task.abort(); } catch (e) { /* ignore */ } }
  },

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

  onClearHistory: function () {
    var that = this;
    wx.showModal({
      title: '清空对话',
      content: '清空后本机保存的问答历史将删除（不影响已收藏的文章）。',
      confirmText: '清空',
      success: function (res) {
        if (!res.confirm) return;
        that.setData({ messages: [], scrollInto: '' });
        try { wx.removeStorageSync(STORE_KEY); } catch (e) { /* ignore */ }
      }
    });
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
    this.scrollBottom();

    var finalize = function (r) {
      that.patchLastAi({
        text: (r && r.answer) || '（空回答）',
        streaming: false,
        sources: ((r && r.sources) || []).map(function (s) {
          return { no: s.no, id: s.id, title: s.title, platformLabel: s.platformLabel };
        }),
        extractive: !!(r && r.extractive),
        refused: !!(r && r.refused)
      });
      that.setData({ sending: false });
      saveHistory(that.data.messages);
      that.scrollBottom();
    };
    var failMsg = function (text) {
      that.patchLastAi({ text: text, streaming: false, sources: [], error: true });
      that.setData({ sending: false });
      saveHistory(that.data.messages);
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
        failMsg('问答失败了：' + (d.error || '未知错误') + '，请稍后重试。');
      }
    }, function (err) {
      if (gotDelta) {
        failMsg('回答中断了，请重试。');
        return;
      }
      // 回退非流式（环境不支持 chunked 或请求级失败）
      api.readAskMulti(question, history, function (data) { finalize(data); }, function () {
        failMsg('问答请求失败了，请稍后重试。');
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
