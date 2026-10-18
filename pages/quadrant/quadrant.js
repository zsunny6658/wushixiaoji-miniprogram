// pages/quadrant/quadrant.js
var helpers = require('../../utils/helpers');
var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    quadrants: { q1: [], q2: [], q3: [], q4: [] },
    totalCount: 0
  },

  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    if (this.getTabBar) this.getTabBar().setData({ active: 2 });
    var that = this;
    app.refreshState(function () { that.compute(); });
  },
  onPullDownRefresh: function () {
    var that = this;
    app.refreshState(function () {
      that.compute();
      wx.stopPullDownRefresh();
    }, { force: true });
  },

  compute: function () {
    var gd = app.globalData;
    var pkgs = (gd.packages || []).map(function (p) { return helpers.decorate(p, gd.members); });
    var pending = pkgs.filter(function (p) { return p.status === 'pending'; });
    var quads = { q1: [], q2: [], q3: [], q4: [] };
    pending.forEach(function (p) {
      var important = (p.importance || 'medium') === 'high';
      var urgent = (p.urgency || 'normal') === 'urgent';
      var key;
      if (important && urgent) key = 'q1';
      else if (important && !urgent) key = 'q2';
      else if (!important && urgent) key = 'q3';
      else key = 'q4';
      quads[key].push(p);
    });
    Object.keys(quads).forEach(function (k) { helpers.sortPackages(quads[k]); });

    this.setData({
      quadrants: quads,
      totalCount: pending.length
    });
  },

  onEdit: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  // 快捷完成：取件/备忘/待还可直接标记完成；用药需走药板打卡，不提供快捷完成
  onQuickDone: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id || e.currentTarget.dataset.type === 'medication') return;
    var that = this;
    wx.showLoading({ title: '处理中…' });
    api.updatePackage(id, { status: 'picked' }, function () {
      wx.hideLoading();
      wx.showToast({ title: '已完成', icon: 'success' });
      app.refreshState(function () { that.compute(); });
    }, function () {
      wx.hideLoading();
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  // 快捷切换重要级：高 ↔ 中（即时改象限归属）
  onQuickFlag: function (e) {
    var id = e.currentTarget.dataset.id;
    var important = e.currentTarget.dataset.important === '1';
    if (!id) return;
    var that = this;
    api.updatePackage(id, { importance: important ? 'medium' : 'high' }, function () {
      app.refreshState(function () { that.compute(); });
    }, function () {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
  },

  onGoAll: function () {
    wx.switchTab({ url: '/pages/list/list' });
  }
});
