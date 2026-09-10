// pages/bind/bind.js
var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    from: 'wx', // wx | email
    passcode: '',
    familyName: '',
    loading: false,
    showCreate: false
  },

  onLoad: function (options) {
    api.setToken(app.globalData.token);
    this.setData({ from: options.from || 'wx' });
  },

  onShow: function () {
    if (app.globalData._wxCode) {
      this._wxCode = app.globalData._wxCode;
    }
  },

  onPasscodeInput: function (e) { this.setData({ passcode: e.detail.value }); },
  onFamilyNameInput: function (e) { this.setData({ familyName: e.detail.value }); },

  // 绑定并登录
  onBind: function () {
    var that = this;
    var code = this.data.passcode.trim();
    if (!code) { wx.showToast({ title: '请输入入口口令', icon: 'none' }); return; }

    if (this.data.from === 'wx') {
      // 微信登录绑定
      this.setData({ loading: true });
      this.getWxCode(function (wxCode) {
        api.request('POST', '/api/auth/wx-login', { wxCode: wxCode, passcode: code }, function (data) {
          that.setData({ loading: false });
          that.onLoginSuccess(data);
        }, function () {
          that.setData({ loading: false });
          wx.showToast({ title: '绑定失败', icon: 'none' });
        });
      });
    } else {
      // 邮箱登录绑定（邮箱已验证，只需绑定家庭码）
      that.setData({ loading: true });
      var emailStr = app.globalData._emailLogin ? app.globalData._emailLogin.email : '';
      api.request('POST', '/api/auth/enter', { passcode: code, email: emailStr }, function (data) {
        that.setData({ loading: false });
        that.onLoginSuccess(data);
      }, function () {
        that.setData({ loading: false });
        wx.showToast({ title: '绑定失败', icon: 'none' });
      });
    }
  },

  // 创建家庭
  onShowCreate: function () { this.setData({ showCreate: true }); },
  onCancelCreate: function () { this.setData({ showCreate: false, familyName: '' }); },
  onCreateFamily: function () {
    var that = this;
    var name = this.data.familyName.trim();
    if (!name) { wx.showToast({ title: '请输入家庭名称', icon: 'none' }); return; }

    this.setData({ loading: true });
    this.getWxCode(function (wxCode) {
      api.request('POST', '/api/auth/wx-create-family', { wxCode: wxCode, familyName: name }, function (data) {
        that.setData({ loading: false, showCreate: false });
        if (data.passcode) {
          wx.showModal({
            title: '家庭创建成功',
            content: '家庭入口口令：' + data.passcode + '\n\n请截图保存，之后家人可以通过这个口令加入你的家庭。',
            showCancel: false,
            confirmText: '知道了'
          });
        }
        that.onLoginSuccess(data);
      }, function () {
        that.setData({ loading: false });
        wx.showToast({ title: '创建失败', icon: 'none' });
      });
    });
  },

  // 获取微信 code
  getWxCode: function (cb) {
    if (this._wxCode) { cb(this._wxCode); this._wxCode = ''; return; }
    wx.login({
      success: function (res) {
        if (res.code) cb(res.code);
        else wx.showToast({ title: '微信登录失败', icon: 'none' });
      },
      fail: function () { wx.showToast({ title: '微信登录失败', icon: 'none' }); }
    });
  },

  // 登录成功
  onLoginSuccess: function (data) {
    var member = data.member || {};
    app.saveToken(data.token, member.name || '', member.familyId || '');
    app.globalData.role = data.role || (member.role || 'member');
    app.globalData.isAdmin = ['owner', 'admin', 'family_admin'].indexOf(app.globalData.role) >= 0;
    api.setToken(data.token);
    app.refreshState(function () {
      wx.switchTab({ url: '/pages/overview/overview' });
    });
  },

  // 返回
  onBack: function () {
    wx.navigateBack({ delta: 1 });
  }
});
