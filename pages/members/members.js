// pages/members/members.js
var api = require('../../utils/api');
var app = getApp();
var COLORS = ['#4f6ef7', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];

Page({
  data: {
    members: [],
    isAdmin: false,
    isFamilyAdmin: false,
    newName: '',
    newEmail: '',
    passcode: '',
    lastMemberId: ''
  },

  onLoad: function () {
    api.setToken(app.globalData.token);
  },
  onShow: function () {
    this.refresh();
  },

  refresh: function () {
    var gd = app.globalData;
    this.setData({
      isAdmin: !!gd.isAdmin,
      isFamilyAdmin: !!gd.isAdmin || gd.role === 'family_admin' || gd.role === 'owner',
      members: (gd.members || []).map(function (m, i) {
        return {
          id: m.id,
          name: m.name,
          email: m.email || '',
          color: COLORS[i % COLORS.length],
          avatar: m.name ? m.name.charAt(0) : '?'
        };
      })
    });
  },

  onNewName: function (e) { this.setData({ newName: e.detail.value }); },
  onNewEmail: function (e) { this.setData({ newEmail: e.detail.value }); },

  onAddMember: function () {
    var name = this.data.newName.trim();
    var email = this.data.newEmail.trim();
    if (!name) { wx.showToast({ title: '请输入成员名', icon: 'none' }); return; }
    var that = this;
    api.createMember(name, email, function (data) {
      that.setData({
        newName: '',
        newEmail: '',
        passcode: data.passcode || data.pass || '',
        lastMemberId: data.id || ''
      });
      wx.showToast({ title: '已创建', icon: 'success' });
      app.refreshState();
    });
  },

  onResend: function (e) {
    var id = e.currentTarget.dataset.id;
    api.request('POST', '/api/members/' + id + '/resend', null, function (data) {
      wx.showToast({ title: '已重发', icon: 'success' });
      this.setData({ passcode: data.passcode || '' });
    }.bind(this));
  },

  onResendLast: function () {
    var id = this.data.lastMemberId;
    if (!id) return;
    api.request('POST', '/api/members/' + id + '/resend', null, function () {
      wx.showToast({ title: '已重发', icon: 'success' });
    });
  },

  onDelete: function (e) {
    var id = e.currentTarget.dataset.id;
    var name = e.currentTarget.dataset.name;
    var that = this;
    wx.showModal({
      title: '删除成员',
      content: '确定删除「' + name + '」？',
      success: function (res) {
        if (res.confirm) {
          api.deleteMember(id, function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            that.refresh();
          });
        }
      }
    });
  },

  onCopyPasscode: function () {
    var code = this.data.passcode;
    if (!code) return;
    wx.setClipboardData({ data: code, success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
  }
});
