// pages/detail/detail.js - 详情页
var api = require('../../utils/api');
var helpers = require('../../utils/helpers');
var app = getApp();

Page({
  data: {
    pkg: null
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    if (!opts || !opts.id) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1000);
      return;
    }
    this.loadDetail(opts.id);
  },

  onShow: function () {
    // 从编辑页返回时刷新
    if (this.data.pkg) {
      this.loadDetail(this.data.pkg.id);
    }
  },

  loadDetail: function (id) {
    var that = this;
    var gd = app.globalData;
    var pkgs = (gd.packages || []);
    var raw = pkgs.find(function (p) { return p.id === id; });
    if (raw) {
      this.applyDetail(raw);
      return;
    }
    // 缓存里没有，先刷新本地状态重试
    app.refreshState(function () {
      raw = (app.globalData.packages || []).find(function (p) { return p.id === id; });
      if (raw) {
        that.applyDetail(raw);
        return;
      }
      // 本地还是没有，走 API 直接查
      api.getPackage(id, function (data) {
        if (data && data.package) {
          that.applyDetail(data.package);
        } else {
          wx.showToast({ title: '记录不存在', icon: 'none' });
          setTimeout(function () { wx.navigateBack(); }, 1000);
        }
      }, function () {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(function () { wx.navigateBack(); }, 1000);
      });
    });
  },

  applyDetail: function (raw) {
    var gd = app.globalData;
    var decorated = helpers.decorate(raw, gd.members);
    this.setData({ pkg: decorated });
    var titleMap = { pickup: '取件详情', todo: '备忘详情', debt: '待还详情' };
    wx.setNavigationBarTitle({ title: titleMap[decorated.type] || '详情' });
  },

  onCopy: function () {
    var code = this.data.pkg.code || '';
    if (!code) { wx.showToast({ title: '没有可复制的内容', icon: 'none' }); return; }
    wx.setClipboardData({
      data: code,
      success: function () { wx.showToast({ title: '已复制', icon: 'success' }); }
    });
  },

  onEdit: function () {
    var id = this.data.pkg.id;
    wx.navigateTo({ url: '/pages/add/add?id=' + id });
  },

  onDelete: function () {
    var self = this;
    var id = this.data.pkg.id;
    wx.showModal({
      title: '确认删除',
      content: '确认删除这条记录？此操作不可恢复',
      confirmColor: '#ef4444',
      success: function (res) {
        if (res.confirm) {
          api.deletePackage(id, function () {
            app.refreshState(function () {
              wx.showToast({ title: '已删除', icon: 'success' });
              setTimeout(function () { wx.navigateBack(); }, 800);
            });
          }, function () {
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  onToggleIgnore: function () {
    var self = this;
    var pkg = this.data.pkg;
    var id = pkg.id;
    if (pkg.status === 'ignored') {
      api.updatePackage(id, { status: 'pending' }, function () {
        app.refreshState(function () { self.loadDetail(id); });
        wx.showToast({ title: '已取消忽略', icon: 'success' });
      });
    } else {
      wx.showModal({
        title: '确认忽略',
        content: '忽略后将在7天后自动删除，确认忽略？',
        success: function (res) {
          if (res.confirm) {
            api.updatePackage(id, { status: 'ignored' }, function () {
              app.refreshState(function () { self.loadDetail(id); });
              wx.showToast({ title: '已忽略，7天后自动删除', icon: 'none' });
            });
          }
        }
      });
    }
  },

  onToggleFlag: function () {
    var self = this;
    var pkg = this.data.pkg;
    var id = pkg.id;
    if (pkg.importance === 'high') {
      api.updatePackage(id, { importance: 'medium' }, function () {
        app.refreshState(function () { self.loadDetail(id); });
        wx.showToast({ title: '已取消重点', icon: 'success' });
      });
    } else {
      api.updatePackage(id, { importance: 'high' }, function () {
        app.refreshState(function () { self.loadDetail(id); });
        wx.showToast({ title: '已标记重点', icon: 'success' });
      });
    }
  },

  onTogglePick: function () {
    var self = this;
    var pkg = this.data.pkg;
    var id = pkg.id;
    if (pkg.status === 'picked') {
      api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, function () {
        app.refreshState(function () { self.loadDetail(id); });
        wx.showToast({ title: '已撤销', icon: 'success' });
      });
    } else {
      api.updatePackage(id, { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me }, function () {
        app.refreshState(function () { self.loadDetail(id); });
        wx.showToast({ title: '已完成', icon: 'success' });
      });
    }
  }
});
