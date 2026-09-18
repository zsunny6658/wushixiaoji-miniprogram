// app.js
var api = require('./utils/api');

App({
  globalData: {
    baseUrl: 'https://parcel.zsunny.top',
    families: [],
    token: '',
    me: '',
    meEmail: '',
    role: '',
    isAdmin: false,
    familyId: '',
    packages: [],
    members: [],
    stats: {},
    quadrants: {},
    viewMode: 'list',
    recordType: 'all',
    filter: 'all',
    importanceFilter: 'all',
    urgencyFilter: 'all',
    group: 'station',
    search: '',
    ignoreCleanupDays: 7
  },

  onLaunch: function () {
    this.globalData.token = wx.getStorageSync('parcel.token') || '';
    this.globalData.me = wx.getStorageSync('parcel.me') || '';
    this.globalData.familyId = wx.getStorageSync('parcel.familyId') || '';
    this.globalData.viewMode = wx.getStorageSync('parcel.viewMode') || 'list';
    this.globalData.recordType = wx.getStorageSync('parcel.recordType') || 'all';
    this.globalData.group = wx.getStorageSync('parcel.group') || 'station';
    this.globalData.ignoreCleanupDays = parseInt(wx.getStorageSync('parcel.ignoreCleanupDays'), 10) || 7;
    api.setBaseUrl(this.globalData.baseUrl);
    if (this.globalData.token) {
      this.refreshState();
    }
  },

  refreshState: function (cb) {
    var that = this;
    api.getState(function (data) {
      that.globalData.packages = data.packages || [];
      that.globalData.members = data.members || [];
      that.globalData.stats = data.stats || {};
      that.globalData.quadrants = data.quadrants || {};
      that.globalData.families = data.families || [];
      // me 是对象 {id, name, color, role, familyId, familyName}
      if (data.me) {
        that.globalData.me = data.me.name || '';
        that.globalData.meEmail = data.me.email || '';
        that.globalData.role = data.me.role || 'member';
        that.globalData.isAdmin = ['owner', 'admin', 'family_admin'].indexOf(data.me.role) >= 0;
      }
      // familyId 从 me.familyId 或 family.id 获取
      if (data.me && data.me.familyId) {
        that.globalData.familyId = data.me.familyId;
      }
      if (data.family) {
        that.globalData.family = data.family;
      }
      cb && cb();
    }, function (err) {
      wx.showToast({ title: '刷新失败', icon: 'none' });
      cb && cb(err);
    });
  },

  saveToken: function (token, me, familyId) {
    this.globalData.token = token;
    this.globalData.me = me || '';
    this.globalData.familyId = familyId || '';
    wx.setStorageSync('parcel.token', token);
    wx.setStorageSync('parcel.me', me || '');
    wx.setStorageSync('parcel.familyId', familyId || '');
  },

  clearToken: function () {
    this.globalData.token = '';
    this.globalData.me = '';
    wx.removeStorageSync('parcel.token');
    wx.removeStorageSync('parcel.me');
  }
});
