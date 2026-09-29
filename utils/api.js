// utils/api.js - API 请求层
// 注意：getApp() 必须在 App() 注册后调用，不能在模块加载时获取
function getApp_() {
  return getApp();
}

var API = {
  baseUrl: '',
  token: '',

  setBaseUrl: function (url) {
    this.baseUrl = url.replace(/\/$/, '');
  },

  setToken: function (token) {
    this.token = token;
  },

  request: function (method, path, data, cb, errCb) {
    if (!this.baseUrl) {
      this.setBaseUrl(getApp_().globalData.baseUrl);
    }
    if (!this.token) {
      this.token = getApp_().globalData.token;
    }
    var header = { 'Content-Type': 'application/json' };
    if (this.token) {
      header['Authorization'] = 'Bearer ' + this.token;
    }
    wx.request({
      url: this.baseUrl + path,
      method: method,
      data: data || {},
      header: header,
      success: function (res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          cb && cb(res.data);
        } else if (res.statusCode === 401) {
          getApp_().clearToken();
          wx.reLaunch({ url: '/pages/login/login' });
        } else {
          var msg = (res.data && res.data.error) || ('HTTP ' + res.statusCode);
          wx.showToast({ title: msg, icon: 'none' });
          errCb && errCb(msg);
        }
      },
      fail: function (err) {
        wx.showToast({ title: '网络错误', icon: 'none' });
        errCb && errCb(err.errMsg);
      }
    });
  },

  // 认证
  login: function (username, password, cb, errCb) {
    this.request('POST', '/api/auth/login', { username: username, password: password }, cb, errCb);
  },
  enter: function (code, cb, errCb) {
    this.request('POST', '/api/auth/enter', { passcode: code }, cb, errCb);
  },
  getMe: function (cb, errCb) {
    this.request('GET', '/api/auth/me', null, cb, errCb);
  },

  // 状态
  getState: function (cb, errCb) {
    this.request('GET', '/api/state', null, cb, errCb);
  },
  getQuadrants: function (cb, errCb) {
    this.request('GET', '/api/packages/quadrants', null, cb, errCb);
  },

  // 取件/备忘
  addPackages: function (items, cb, errCb) {
    this.request('POST', '/api/packages', { items: items }, cb, errCb);
  },
  getPackage: function (id, cb, errCb) {
    this.request('GET', '/api/packages/' + id, null, cb, errCb);
  },
  updatePackage: function (id, data, cb, errCb) {
    this.request('PATCH', '/api/packages/' + id, data, cb, errCb);
  },
  deletePackage: function (id, cb, errCb) {
    this.request('DELETE', '/api/packages/' + id, null, cb, errCb);
  },
  clearPicked: function (cb, errCb) {
    this.request('POST', '/api/packages/clear-picked', {}, cb, errCb);
  },

  // 解析
  parse: function (text, type, cb, errCb) {
    this.request('POST', '/api/parse', { text: text, type: type || 'auto' }, cb, errCb);
  },
  parseImage: function (images, type, cb, errCb) {
    this.request('POST', '/api/parse/image', { images: images, type: type || 'auto' }, cb, errCb);
  },
  parseAudio: function (audio, cb, errCb) {
    this.request('POST', '/api/parse/audio', { audio: audio }, cb, errCb);
  },
  voiceTranscribe: function (audioBase64, format, cb, errCb) {
    this.request('POST', '/api/voice/transcribe', { audio: audioBase64, format: format || 'mp3' }, cb, errCb);
  },
  voiceStatus: function (cb, errCb) {
    this.request('GET', '/api/voice/status', null, cb, errCb);
  },

  // 成员
  getMembers: function (cb, errCb) {
    this.request('GET', '/api/members', null, cb, errCb);
  },
  createMember: function (name, email, cb, errCb) {
    this.request('POST', '/api/members', { name: name, email: email || '' }, cb, errCb);
  },
  deleteMember: function (id, cb, errCb) {
    this.request('DELETE', '/api/members/' + id, null, cb, errCb);
  },

  // 家庭
  getFamilies: function (cb, errCb) {
    this.request('GET', '/api/families', null, cb, errCb);
  },
  createFamily: function (data, cb, errCb) {
    this.request('POST', '/api/families', data, cb, errCb);
  },

  // 个人设置
  getProfile: function (cb, errCb) {
    this.request('GET', '/api/profile', null, cb, errCb);
  },
  updateProfile: function (data, cb, errCb) {
    this.request('PUT', '/api/profile', data, cb, errCb);
  },
  changePassword: function (data, cb, errCb) {
    this.request('POST', '/api/auth/change-password', data, cb, errCb);
  },

  // 配置
  getConfig: function (familyId, cb, errCb) {
    this.request('GET', '/api/config' + (familyId ? '?familyId=' + familyId : ''), null, cb, errCb);
  },
  updateConfig: function (data, familyId, cb, errCb) {
    this.request('PUT', '/api/config' + (familyId ? '?familyId=' + familyId : ''), data, cb, errCb);
  },
  testEmail: function (to, familyId, cb, errCb) {
    this.request('POST', '/api/config/test-email' + (familyId ? '?familyId=' + familyId : ''), { to: to }, cb, errCb);
  },
  testAI: function (familyId, cb, errCb) {
    this.request('POST', '/api/config/test-ai' + (familyId ? '?familyId=' + familyId : ''), {}, cb, errCb);
  },

  // CLI Token
  getCliTokens: function (cb, errCb) {
    this.request('GET', '/api/cli-tokens', null, cb, errCb);
  },
  createCliToken: function (data, cb, errCb) {
    this.request('POST', '/api/cli-tokens', data, cb, errCb);
  },
  deleteCliToken: function (id, cb, errCb) {
    this.request('DELETE', '/api/cli-tokens/' + id, null, cb, errCb);
  },

  // Webhook
  getWebhooks: function (familyId, cb, errCb) {
    this.request('GET', '/api/webhooks' + (familyId ? '?familyId=' + familyId : ''), null, cb, errCb);
  },
  createWebhook: function (data, cb, errCb) {
    this.request('POST', '/api/webhooks', data, cb, errCb);
  },
  deleteWebhook: function (id, cb, errCb) {
    this.request('DELETE', '/api/webhooks/' + id, null, cb, errCb);
  },

  // 成员口令重发
  resendMember: function (id, cb, errCb) {
    this.request('POST', '/api/members/' + id + '/resend', {}, cb, errCb);
  },

  // 通知设置
  getNotifyConfig: function (cb, errCb) {
    this.request('GET', '/api/notify/config', null, cb, errCb);
  },
  updateNotifyConfig: function (data, cb, errCb) {
    this.request('PUT', '/api/notify/config', data, cb, errCb);
  },

  // 智能忽略规则
  getIgnoreRules: function (cb, errCb) {
    this.request('GET', '/api/ignore-rules', null, cb, errCb);
  },
  addIgnoreRule: function (data, cb, errCb) {
    this.request('POST', '/api/ignore-rules', data, cb, errCb);
  },
  deleteIgnoreRule: function (id, cb, errCb) {
    this.request('DELETE', '/api/ignore-rules/' + id, null, cb, errCb);
  },
  ignoreWithRule: function (id, data, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/ignore-with-rule', data, cb, errCb);
  },

  // 恢复
  restorePackage: function (id, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/restore', {}, cb, errCb);
  },

  // 归档
  archivePackage: function (id, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/archive', {}, cb, errCb);
  },
  getArchivedPackages: function (cb, errCb) {
    this.request('GET', '/api/packages/archived', null, cb, errCb);
  },
  unarchivePackage: function (id, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/unarchive', {}, cb, errCb);
  },

  // 用药打卡（仿真药板）
  getMedLogs: function (id, date, cb, errCb) {
    this.request('GET', '/api/packages/' + id + '/medlogs' + (date ? '?date=' + date : ''), null, cb, errCb);
  },
  takeMed: function (id, data, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/medlogs', data, cb, errCb);
  },
  untakeMed: function (id, logId, cb, errCb) {
    this.request('DELETE', '/api/packages/' + id + '/medlogs/' + logId, null, cb, errCb);
  }
};

module.exports = API;
