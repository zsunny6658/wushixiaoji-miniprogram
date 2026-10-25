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

  // 相对 API 路径 → 绝对 URL（图片 src 等场景）
  absUrl: function (path) {
    if (!this.baseUrl) {
      this.setBaseUrl(getApp_().globalData.baseUrl);
    }
    return this.baseUrl + path;
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

  // 智能重要度（v0.16.0）
  aiImportance: function (text, pkgType, cb, errCb) {
    this.request('POST', '/api/ai/importance', { text: text, pkgType: pkgType || 'todo' }, cb, errCb);
  },
  getSmartImportance: function (familyId, cb, errCb) {
    this.request('GET', '/api/packages/smart-importance' + (familyId ? '?familyId=' + familyId : ''), null, cb, errCb);
  },
  getBehaviorSummary: function (familyId, cb, errCb) {
    this.request('GET', '/api/behavior/summary' + (familyId ? '?familyId=' + familyId : ''), null, cb, errCb);
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
  },
  resetMedBoard: function (id, boardNo, takenPositions, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/medlogs/reset', { boardNo: boardNo, takenPositions: takenPositions || [] }, cb, errCb);
  },
  // 药板照片识别（初始化预填辅助）：image 为 dataURL
  recognizeMedBoard: function (id, image, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/medboard/recognize', { image: image }, cb, errCb);
  },
  // 开新盒：盒号 +1、版号重置 1，历史流水保留
  openMedBox: function (id, cb, errCb) {
    this.request('POST', '/api/packages/' + id + '/medbox/new', {}, cb, errCb);
  },
  // 药名输入联想
  suggestDrugs: function (q, cb, errCb) {
    this.request('GET', '/api/drugs/suggest', { q: q, limit: 6 }, cb, errCb);
  },
  // 药品形态搜索（本地库 + AI 兜底）
  searchDrugs: function (name, cb, errCb) {
    this.request('GET', '/api/drugs/search', { name: name }, cb, errCb);
  },

  // 待读 / 个人知识库（v0.18.0）
  readList: function (params, cb, errCb) {
    var p = params || {};
    var qs = [];
    ['status', 'platform', 'tag', 'q', 'sort', 'limit', 'offset'].forEach(function (k) {
      if (p[k] !== undefined && p[k] !== null && p[k] !== '') qs.push(k + '=' + encodeURIComponent(p[k]));
    });
    this.request('GET', '/api/read' + (qs.length ? '?' + qs.join('&') : ''), null, cb, errCb);
  },
  readAdd: function (url, note, cb, errCb) {
    this.request('POST', '/api/read', { url: url, note: note || '' }, cb, errCb);
  },
  readDetail: function (id, cb, errCb) {
    this.request('GET', '/api/read/' + id, null, cb, errCb);
  },
  readContent: function (id, cb, errCb) {
    this.request('GET', '/api/read/' + id + '/content', null, cb, errCb);
  },
  readPatch: function (id, data, cb, errCb) {
    this.request('PATCH', '/api/read/' + id, data, cb, errCb);
  },
  readDelete: function (id, cb, errCb) {
    this.request('DELETE', '/api/read/' + id, null, cb, errCb);
  },
  readRefetch: function (id, cb, errCb) {
    this.request('POST', '/api/read/' + id + '/refetch', {}, cb, errCb);
  },
  readSearch: function (q, cb, errCb) {
    this.request('GET', '/api/read/search?q=' + encodeURIComponent(q), null, cb, errCb);
  },
  readStats: function (cb, errCb) {
    this.request('GET', '/api/read/stats', null, cb, errCb);
  },
  readTags: function (cb, errCb) {
    this.request('GET', '/api/read/tags', null, cb, errCb);
  },
  readIndexStats: function (cb, errCb) {
    this.request('GET', '/api/read/index/stats', null, cb, errCb);
  },
  readIndexRebuild: function (cb, errCb) {
    this.request('POST', '/api/read/index/rebuild', {}, cb, errCb);
  },
  readTagSuggest: function (cb, errCb) {
    this.request('GET', '/api/read/tags/suggest', null, cb, errCb);
  },
  readTagMerge: function (from, to, cb, errCb) {
    this.request('POST', '/api/read/tags/merge', { from: from, to: to }, cb, errCb);
  },

  // 附件（v0.17.0）
  // 批量签发图片预览 URL（带过期签名，<image> 标签可直接引用）
  signFileUrls: function (ids, cb, errCb) {
    this.request('POST', '/api/files/sign', { ids: ids }, cb, errCb);
  },
  // 单独上传图片附件（dataURL 数组），返回 { ids }
  uploadImages: function (images, cb, errCb) {
    this.request('POST', '/api/files', { images: images }, cb, errCb);
  }
};

module.exports = API;
