// pages/settings/settings.js - 设置页（支持 action 参数）
var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    action: '', // profile | password | tokens | webhooks | mail
    // 个人设置
    profile: { username: '', displayName: '', email: '', avatarUrl: '' },
    hasAccount: false,
    // 密码
    pwdForm: { oldPassword: '', familyPasscode: '', newPassword: '', confirm: '' },
    pwdMode: 'password',
    // Token
    tokens: [],
    newTokenName: '',
    newTokenExpiry: '',
    newTokenPerms: ['read'],
    permOptions: [
      { id: 'read', label: '只读', desc: '查看列表/统计/解析' },
      { id: 'write', label: '读写', desc: '增删改+解析' },
      { id: 'admin', label: '管理', desc: '全部权限' }
    ],
    // Webhook
    webhooks: [],
    newWebhookName: '',
    newWebhookExpiry: '',
    newWebhookPerms: ['read', 'write'],
    // 配置（mail/AI）
    config: {
      smtpHost: '', smtpPort: '465', smtpSecure: true,
      smtpUser: '', smtpPass: '', smtpFrom: '', smtpFromName: '',
      aiProvider: '', aiModel: '', aiBaseUrl: '', aiApiKey: '',
      ignoreCleanupDays: 7,
      reminderDays: 3
    },
    mailConfigured: false,
    testEmailTo: '',
    // 语音额度
    asrStatus: null,
    // 通用
    meName: '',
    meFirstChar: '?',
    roleLabel: '成员',
    familyName: '',
    isAdmin: false,
    familyId: '',
    baseUrl: 'https://parcel.zsunny.top',
    version: '1.0.0',
    icpText: '浙ICP备2026069987号-2',
    govText: '浙公网安备33019202003263号'
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    var version;
    try { version = require('../../version.js').version; } catch (e) { version = ''; }
    this.setData({ action: (opts && opts.action) || '', version: version });
  },

  onShow: function () {
    this.refresh();
    this.loadByAction();
    this.loadAsrStatus();
  },

  loadAsrStatus: function () {
    var that = this;
    api.voiceStatus(function (data) {
      if (data && data.asr) {
        that.setData({ asrStatus: data.asr });
      }
    });
  },

  refresh: function () {
    var gd = app.globalData;
    var me = gd.me || '';
    var role = gd.role || 'member';
    var roleMap = { admin: '管理员', owner: '超级管理员', family_admin: '家庭管理员', member: '成员' };
    this.setData({
      meName: me || '未登录',
      meFirstChar: me ? me.charAt(0) : '?',
      roleLabel: roleMap[role] || role,
      isAdmin: !!gd.isAdmin,
      familyId: gd.familyId || '',
      familyName: this.findFamilyName(gd.familyId),
      baseUrl: gd.baseUrl || 'https://parcel.zsunny.top'
    });
  },

  findFamilyName: function (fid) {
    var fams = app.globalData.families || [];
    for (var i = 0; i < fams.length; i++) { if (fams[i].id === fid) return fams[i].name || '未命名家庭'; }
    return '未指定';
  },

  // 根据 action 加载对应数据
  loadByAction: function () {
    var a = this.data.action;
    var that = this;
    if (a === 'profile') {
      api.getProfile(function (data) {
        if (data && data.user) {
          that.setData({
            hasAccount: true,
            profile: {
              username: data.user.username || '',
              displayName: data.user.displayName || '',
              email: data.user.email || '',
              avatarUrl: data.user.avatarUrl || ''
            }
          });
        } else {
          that.setData({ hasAccount: false });
        }
      });
    } else if (a === 'tokens') {
      api.getCliTokens(function (data) {
        that.setData({ tokens: (data && data.tokens) || [] });
      });
    } else if (a === 'webhooks') {
      api.getWebhooks(this.data.familyId, function (data) {
        that.setData({ webhooks: (data && data.webhooks) || [] });
      });
    } else if (a === 'mail') {
      api.getConfig(this.data.familyId, function (data) {
        var c = (data && data.config) || {};
        var s = c.smtp || {};
        var a = c.ai || {};
        that.setData({
          config: {
            smtpHost: s.host || '',
            smtpPort: String(s.port || 587),
            smtpSecure: s.secure !== false,
            smtpUser: s.user || '',
            smtpPass: '',
            smtpFrom: s.from || '',
            smtpFromName: '',
            aiProvider: a.provider || '',
            aiModel: a.textModel || '',
            aiBaseUrl: a.baseURL || '',
            aiApiKey: '',
            ignoreCleanupDays: c.ignoreCleanupDays || 7,
            reminderDays: (c.notify && c.notify.daysBefore) || 3
          },
          mailConfigured: data && data.mailConfigured
        });
      });
    }
  },

  // 个人设置
  onProfileInput: function (e) {
    var f = e.currentTarget.dataset.field;
    this.setData({ ['profile.' + f]: e.detail.value });
  },
  onChooseAvatar: function (e) {
    var avatarUrl = e.detail.avatarUrl;
    this.setData({ 'profile.avatarUrl': avatarUrl });
  },
  onSaveProfile: function () {
    var that = this;
    var p = this.data.profile;
    api.updateProfile(p, function () {
      // 头像变了要刷新全局状态
      if (p.avatarUrl) {
        app.globalData.meAvatar = p.avatarUrl;
      }
      app.refreshState(function () {
        wx.showToast({ title: '保存成功', icon: 'success' });
        // 停留片刻让用户看到提示，再返回「我的」页
        setTimeout(function () { wx.navigateBack(); }, 800);
      });
    });
  },

  // 密码
  onPwdInput: function (e) {
    var f = e.currentTarget.dataset.field;
    this.setData({ ['pwdForm.' + f]: e.detail.value });
  },
  onPwdModeChange: function (e) {
    this.setData({ pwdMode: e.currentTarget.dataset.mode });
  },
  onSavePassword: function () {
    var that = this;
    var p = this.data.pwdForm;
    if (this.data.pwdMode === 'password' && !p.oldPassword) {
      wx.showToast({ title: '请输入当前密码', icon: 'none' });
      return;
    }
    if (this.data.pwdMode === 'passcode' && !p.familyPasscode) {
      wx.showToast({ title: '请输入家庭码', icon: 'none' });
      return;
    }
    if (!p.newPassword) {
      wx.showToast({ title: '请输入新密码', icon: 'none' });
      return;
    }
    if (p.newPassword !== p.confirm) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    var body = { newPassword: p.newPassword };
    if (this.data.pwdMode === 'password') body.oldPassword = p.oldPassword;
    else body.familyPasscode = p.familyPasscode;
    api.request('POST', '/api/auth/change-password', body, function () {
      wx.showToast({ title: '已修改', icon: 'success' });
      that.setData({ pwdForm: { oldPassword: '', familyPasscode: '', newPassword: '', confirm: '' } });
    });
  },

  // Token
  onNewTokenName: function (e) { this.setData({ newTokenName: e.detail.value }); },
  onNewTokenExpiry: function (e) { this.setData({ newTokenExpiry: e.detail.value }); },
  onTokenPermChange: function (e) {
    var id = e.currentTarget.dataset.id;
    var perms = this.data.newTokenPerms.slice();
    var idx = perms.indexOf(id);
    if (idx >= 0) perms.splice(idx, 1); else perms.push(id);
    if (perms.indexOf('admin') >= 0) perms = ['admin'];
    else { if (perms.indexOf('read') < 0) perms.unshift('read'); }
    this.setData({ newTokenPerms: perms });
  },
  onCreateToken: function () {
    var that = this;
    var name = this.data.newTokenName.trim();
    if (!name) { wx.showToast({ title: '请输入名称', icon: 'none' }); return; }
    var data = { name: name };
    if (this.data.newTokenExpiry) data.expiresAt = this.data.newTokenExpiry;
    data.permissions = this.data.newTokenPerms;
    api.request('POST', '/api/cli-tokens', data, function (res) {
      if (res && res.token) {
        wx.showModal({
          title: 'Token 已生成',
          content: res.token.value || '',
          showCancel: false,
          confirmText: '复制',
          success: function () {
            wx.setClipboardData({ data: res.token.value || '' });
          }
        });
      }
      api.request('GET', '/api/cli-tokens', null, function (data) { that.setData({ tokens: (data && data.tokens) || [] }); });
      that.setData({ newTokenName: '', newTokenExpiry: '', newTokenPerms: ['read'] });
    });
  },
  onDeleteToken: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除此 Token？',
      success: function (res) {
        if (res.confirm) {
          api.request('DELETE', '/api/cli-tokens/' + id, null, function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            api.request('GET', '/api/cli-tokens', null, function (data) { that.setData({ tokens: (data && data.tokens) || [] }); });
          });
        }
      }
    });
  },

  // Webhook
  onNewWebhookName: function (e) { this.setData({ newWebhookName: e.detail.value }); },
  onNewWebhookExpiry: function (e) { this.setData({ newWebhookExpiry: e.detail.value }); },
  onWebhookPermChange: function (e) {
    var id = e.currentTarget.dataset.id;
    var perms = this.data.newWebhookPerms.slice();
    var idx = perms.indexOf(id);
    if (idx >= 0) perms.splice(idx, 1); else perms.push(id);
    if (perms.indexOf('admin') >= 0) perms = ['admin'];
    else { if (perms.indexOf('read') < 0) perms.unshift('read'); }
    this.setData({ newWebhookPerms: perms });
  },
  onCreateWebhook: function () {
    var that = this;
    var name = this.data.newWebhookName.trim();
    if (!name) { wx.showToast({ title: '请输入名称', icon: 'none' }); return; }
    var data = { name: name };
    if (this.data.newWebhookExpiry) data.expiresAt = this.data.newWebhookExpiry;
    data.permissions = this.data.newWebhookPerms;
    api.request('POST', '/api/webhooks', data, function (res) {
      if (res && res.webhook) {
        wx.showModal({
          title: 'Webhook 已生成',
          content: res.webhook.token || res.webhook.value || '',
          showCancel: false,
          confirmText: '复制',
          success: function () {
            wx.setClipboardData({ data: res.webhook.token || res.webhook.value || '' });
          }
        });
      }
      var fid = that.data.familyId;
      api.request('GET', '/api/webhooks' + (fid ? '?familyId=' + fid : ''), null, function (data) { that.setData({ webhooks: (data && data.webhooks) || [] }); });
      that.setData({ newWebhookName: '', newWebhookExpiry: '', newWebhookPerms: ['read', 'write'] });
    });
  },
  onDeleteWebhook: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '删除此 Webhook？',
      success: function (res) {
        if (res.confirm) {
          api.request('DELETE', '/api/webhooks/' + id, null, function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            var fid = that.data.familyId;
            api.request('GET', '/api/webhooks' + (fid ? '?familyId=' + fid : ''), null, function (data) { that.setData({ webhooks: (data && data.webhooks) || [] }); });
          });
        }
      }
    });
  },

  // 配置
  onConfigInput: function (e) {
    var f = e.currentTarget.dataset.field;
    this.setData({ ['config.' + f]: e.detail.value });
  },
  onConfigSwitch: function (e) {
    var f = e.currentTarget.dataset.field;
    this.setData({ ['config.' + f]: e.detail.value });
  },
  onSaveConfig: function () {
    var c = this.data.config;
    var patch = {
      smtp: {
        host: c.smtpHost,
        port: parseInt(c.smtpPort, 10) || 587,
        secure: c.smtpSecure,
        user: c.smtpUser,
        pass: c.smtpPass || undefined,
        from: c.smtpFrom
      },
      ai: {
        enabled: true,
        provider: c.aiProvider || 'openai',
        baseURL: c.aiBaseUrl,
        apiKey: c.aiApiKey || undefined,
        textModel: c.aiModel
      },
      ignoreCleanupDays: Math.max(1, parseInt(c.ignoreCleanupDays, 10) || 7),
      notify: { daysBefore: Math.max(1, parseInt(c.reminderDays, 10) || 3) }
    };
    api.updateConfig(patch, this.data.familyId, function () {
      app.globalData.ignoreCleanupDays = patch.ignoreCleanupDays;
      wx.setStorageSync('parcel.ignoreCleanupDays', String(patch.ignoreCleanupDays));
      wx.setStorageSync('parcel.reminderDays', String(patch.notify.daysBefore));
      wx.showToast({ title: '已保存', icon: 'success' });
    });
  },
  onTestEmail: function () {
    var to = this.data.testEmailTo.trim();
    if (!to) { wx.showToast({ title: '请输入测试邮箱', icon: 'none' }); return; }
    wx.showLoading({ title: '测试中...' });
    api.testEmail(to, this.data.familyId, function (data) {
      wx.hideLoading();
      wx.showToast({ title: data && data.ok ? '已发送' : '失败', icon: 'none' });
    }, function () {
      wx.hideLoading();
    });
  },
  onTestAI: function () {
    wx.showLoading({ title: '测试中...' });
    api.testAI(this.data.familyId, function (data) {
      wx.hideLoading();
      wx.showToast({ title: data && data.ok ? '连通正常' : '连通失败', icon: 'none' });
    }, function () {
      wx.hideLoading();
    });
  },
  onCopyICP: function () {
    wx.setClipboardData({
      data: '浙ICP备2026069987号-2  浙公网安备33019202003263号',
      success: function () { wx.showToast({ title: '已复制', icon: 'success' }); }
    });
  }
});
