// utils/subscribe.js - 订阅消息配额辅助
// 微信一次性订阅：一次授权只能收一条推送。在用户关键点击动作（保存用药/打卡）中
// 顺带调用 requestSubscribeMessage 请求授权；用户勾选「总是保持以上选择」后，
// 后续调用将静默 accept，持续补充服务端推送配额。
var api = require('./api');

// 与「我的→通知设置」默认模板保持一致；服务端模板字段见 server/notify.js buildTmplData
var DEFAULT_TMPL = '2HWGe9LDE0bVe7abqxk7nRQA1zqqUUkUTk1ymx7rzLI';
var lastAsk = 0;

function askSubscribe(tmplId) {
  var now = Date.now();
  if (now - lastAsk < 60000) return; // 60s 内不重复弹窗打扰
  lastAsk = now;
  var id = tmplId || DEFAULT_TMPL;
  wx.requestSubscribeMessage({
    tmplIds: [id],
    success: function (res) {
      if (res[id] === 'accept') {
        // 服务端记录订阅状态（lastSubscribedAt），失败不影响前端
        api.request('POST', '/api/notify/subscribe', {}, function () {}, function () {});
      }
    },
    fail: function () {}
  });
}

module.exports = { askSubscribe: askSubscribe, DEFAULT_TMPL: DEFAULT_TMPL };
