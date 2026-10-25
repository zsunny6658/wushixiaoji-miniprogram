// pages/read-ask/read-ask.js - 待读知识库问答（个人维度 RAG）
var api = require('../../utils/api');

var MSG_ID = 0;
function nextId() { MSG_ID += 1; return 'm' + MSG_ID; }

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

  onSend: function () {
    var question = (this.data.input || '').trim();
    if (!question || this.data.sending) return;
    var that = this;
    var userMsg = { id: nextId(), role: 'user', text: question };
    this.setData({
      messages: this.data.messages.concat([userMsg]),
      input: '',
      canSend: false,
      sending: true,
      scrollInto: 'qa-bottom'
    });

    api.readAsk(question, function (data) {
      var sources = (data && data.sources) || [];
      that.setData({
        sending: false,
        messages: that.data.messages.concat([{
          id: nextId(),
          role: 'ai',
          text: (data && data.answer) || '（空回答）',
          sources: sources.map(function (s) {
            return { no: s.no, id: s.id, title: s.title, platformLabel: s.platformLabel };
          }),
          extractive: !!(data && data.extractive),
          refused: !!(data && data.refused)
        }]),
        scrollInto: 'qa-bottom'
      });
    }, function () {
      that.setData({
        sending: false,
        messages: that.data.messages.concat([{
          id: nextId(),
          role: 'ai',
          text: '问答请求失败了，请稍后重试。',
          sources: []
        }]),
        scrollInto: 'qa-bottom'
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
