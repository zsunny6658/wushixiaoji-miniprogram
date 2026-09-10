// pages/settings/settings.js - 设置页（支持 action 参数）
var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    action: '', // profile | password | tokens | webhooks | mail
    // 个人设置
    profile: { username: '', displayName: '', email: '' },
    hasAccount: false,
    // 密码
    pwdForm: { oldPassword: '', newPassword: '', confirm: '' },
    // Token
    tokens: [],
    newTokenName: '',
    newTokenExpiry: '',
    // Webhook
    webhooks: [],
    newWebhookName: '',
    newWebhookExpiry: '',
    // 配置（mail/AI）
    config: {
      smtpHost: '', smtpPort: '465', smtpSecure: true,
      smtpUser: '', smtpPass: '', smtpFrom: '', smtpFromName: '',
      aiProvider: '', aiModel: '', aiBaseUrl: '', aiApiKey: ''
    },
    mailConfigured: false,
    testEmailTo: '',
    // 通用
    meName: '',
    meFirstChar: '?',
    roleLabel: '成员',
    familyName: '',
    isAdmin: false,
    familyId: '',
    baseUrl: 'https://parcel.zsunny.top'
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    this.setData({ action: (opts && opts.action) || '' });
  },

  onShow: function () {
    this.refresh();
    this.loadByAction();
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
              email: data.user.email || ''
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
        that.setData({
          config: {
            smtpHost: c.smtpHost || '',
            smtpPort: String(c.smtpPort || '465'),
            smtpSecure: c.smtpSecure !== false,
            smtpUser: c.smtpUser || '',
            smtpPass: c.smtpPass || '',
            smtpFrom: c.smtpFrom || '',
            smtpFromName: c.smtpFromName || '',
            aiProvider: c.aiProvider || '',
            aiModel: c.aiModel || '',
            aiBaseUrl: c.aiBaseUrl || '',
            aiApiKey: c.aiApiKey || ''
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
  onSaveProfile: function () {
    var p = this.data.profile;
    api.updateProfile(p, function () {
      wx.showToast({ title: '已保存', icon: 'success' });
    });
  },

  // 密码
  onPwdInput: function (e) {
    var f = e.currentTarget.dataset.field;
    this.setData({ ['pwdForm.' + f]: e.detail.value });
  },
  onSavePassword: function () {
    var that = this;
    var p = this.data.pwdForm;
    if (!p.oldPassword || !p.newPassword) {
      wx.showToast({ title: '请填写完整', icon: 'none' });
      return;
    }
    if (p.newPassword !== p.confirm) {
      wx.showToast({ title: '两次密码不一致', icon: 'none' });
      return;
    }
    api.changePassword({ oldPassword: p.oldPassword, newPassword: p.newPassword }, function () {
      wx.showToast({ title: '已修改', icon: 'success' });
      that.setData({ pwdForm: { oldPassword: '', newPassword: '', confirm: '' } });
    });
  },

  // Token
  onNewTokenName: function (e) { this.setData({ newTokenName: e.detail.value }); },
  onNewTokenExpiry: function (e) { this.setData({ newTokenExpiry: e.detail.value }); },
  onCreateToken: function () {
    var that = this;
    var name = this.data.newTokenName.trim();
    if (!name) { wx.showToast({ title: '请输入名称', icon: 'none' }); return; }
    var data = { name: name };
    if (this.data.newTokenExpiry) data.expiresAt = this.data.newTokenExpiry;
    api.createCliToken(data, function (res) {
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
      api.getCliTokens(function (data) { that.setData({ tokens: (data && data.tokens) || [] }); });
      that.setData({ newTokenName: '', newTokenExpiry: '' });
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
          api.deleteCliToken(id, function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            api.getCliTokens(function (data) { that.setData({ tokens: (data && data.tokens) || [] }); });
          });
        }
      }
    });
  },

  // Webhook
  onNewWebhookName: function (e) { this.setData({ newWebhookName: e.detail.value }); },
  onNewWebhookExpiry: function (e) { this.setData({ newWebhookExpiry: e.detail.value }); },
  onCreateWebhook: function () {
    var that = this;
    var name = this.data.newWebhookName.trim();
    if (!name) { wx.showToast({ title: '请输入名称', icon: 'none' }); return; }
    var data = { name: name };
    if (this.data.newWebhookExpiry) data.expiresAt = this.data.newWebhookExpiry;
    api.createWebhook(data, function (res) {
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
      api.getWebhooks(this.data.familyId, function (data) { that.setData({ webhooks: (data && data.webhooks) || [] }); });
      that.setData({ newWebhookName: '', newWebhookExpiry: '' });
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
          api.deleteWebhook(id, function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            api.getWebhooks(this.data.familyId, function (data) { that.setData({ webhooks: (data && data.webhooks) || [] }); });
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
    var patch = {};
    Object.keys(c).forEach(function (k) {
      if (c[k] !== '') patch[k] = c[k];
    });
    api.updateConfig(patch, this.data.familyId, function () {
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
  }
});
