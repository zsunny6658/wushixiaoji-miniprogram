// pages/login/login.js
var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    view: 'wx', // wx | email
    wxLoading: false,
    email: '',
    emailPass: '',
    emailCode: '',
    emailTab: 'password', // password | code
    codeSending: false,
    codeSent: false,
    countdown: 0
  },

  // === 微信一键登录 ===
  onWxLogin: function () {
    var that = this;
    if (this.data.wxLoading) return;
    this.setData({ wxLoading: true });

    wx.login({
      success: function (loginRes) {
        if (!loginRes.code) {
          that.setData({ wxLoading: false });
          wx.showToast({ title: '微信登录失败', icon: 'none' });
          return;
        }
        api.request('POST', '/api/auth/wx-login', { wxCode: loginRes.code }, function (data) {
          if (data.needBind) {
            app.globalData._wxCode = loginRes.code;
            that.setData({ wxLoading: false });
            wx.navigateTo({ url: '/pages/bind/bind' });
          } else {
            that.setData({ wxLoading: false });
            that.onLoginSuccess(data);
          }
        }, function () {
          that.setData({ wxLoading: false });
        });
      },
      fail: function () {
        that.setData({ wxLoading: false });
        wx.showToast({ title: '微信登录失败', icon: 'none' });
      }
    });
  },

  // === 切换到邮箱登录 ===
  onShowEmail: function () { this.setData({ view: 'email' }); },
  onBackToWx: function () { this.setData({ view: 'wx', email: '', emailPass: '', emailCode: '' }); },

  // === 邮箱 Tab 切换 ===
  onEmailTab: function (e) { this.setData({ emailTab: e.currentTarget.dataset.tab, emailPass: '', emailCode: '' }); },

  // === 邮箱输入 ===
  onEmailInput: function (e) { this.setData({ email: e.detail.value }); },
  onEmailPassInput: function (e) { this.setData({ emailPass: e.detail.value }); },
  onEmailCodeInput: function (e) { this.setData({ emailCode: e.detail.value }); },

  // === 发送验证码 ===
  onSendCode: function () {
    var that = this;
    var email = this.data.email.trim();
    if (!email) { wx.showToast({ title: '请输入邮箱', icon: 'none' }); return; }

    this.setData({ codeSending: true });
    api.request('POST', '/api/auth/send-code', { email: email }, function (data) {
      that.setData({ codeSending: false, codeSent: true, countdown: 60 });
      wx.showToast({ title: '验证码已发送', icon: 'none' });
      that.startCountdown();
    }, function () {
      that.setData({ codeSending: false });
    });
  },

  startCountdown: function () {
    var that = this;
    this._timer = setInterval(function () {
      var cd = that.data.countdown - 1;
      that.setData({ countdown: cd });
      if (cd <= 0) {
        clearInterval(that._timer);
        that.setData({ codeSent: false });
      }
    }, 1000);
  },

  // === 邮箱登录（密码/验证码）===
  onEmailLogin: function () {
    var that = this;
    var email = this.data.email.trim();
    if (!email) { wx.showToast({ title: '请输入账号', icon: 'none' }); return; }

    if (this.data.emailTab === 'password') {
var pass = this.data.emailPass;
      if (!pass) { wx.showToast({ title: '请输入密码', icon: 'none' }); return; }
      api.request('POST', '/api/auth/login', { email: email, password: pass }, function (data) {
        that.onEmailLoginResult(data);
      }, function () {
        wx.showToast({ title: '登录失败', icon: 'none' });
      });
    } else {
      var code = this.data.emailCode.trim();
      if (!code) { wx.showToast({ title: '请输入验证码', icon: 'none' }); return; }
      api.request('POST', '/api/auth/login-code', { email: email, code: code }, function (data) {
        that.onEmailLoginResult(data);
      }, function () {
        wx.showToast({ title: '登录失败', icon: 'none' });
      });
    }
  },

  onEmailLoginResult: function (data) {
    if (data.needsPasscode) {
      // 邮箱未绑定家庭：跳转绑定页
      app.globalData._emailLogin = { email: data.email, memberName: data.memberName };
      wx.navigateTo({ url: '/pages/bind/bind?from=email' });
    } else {
      this.onLoginSuccess(data);
    }
  },

  // === 登录成功 ===
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

  onHide: function () {
    // 切到后台时停止倒计时，避免内存泄漏
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  },
  onUnload: function () {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
  }
});
