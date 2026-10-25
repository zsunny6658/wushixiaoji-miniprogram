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
    // 待读是个人维度内容，不进家庭四象限
    var pending = pkgs.filter(function (p) { return p.status === 'pending' && p.type !== 'read'; });
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
    this.loadSmart(quads);
  },

  // 个人重要度建议（v0.16.0）：按当前成员行为画像，给建议重要 ≠ 当前设置的卡片打 AI 徽标
  loadSmart: function (quads) {
    var that = this;
    var fid = app.globalData.familyId || '';
    if (!fid) return;
    api.getSmartImportance(fid, function (data) {
      var sug = (data && data.suggestions) || {};
      var patch = {};
      ['q1', 'q2', 'q3', 'q4'].forEach(function (k) {
        (quads[k] || []).forEach(function (p, i) {
          var s = sug[p.id];
          if (!s) return;
          if (s.suggested === 'high' && p.importance !== 'high') {
            patch['quadrants.' + k + '[' + i + '].aiUp'] = true;
            patch['quadrants.' + k + '[' + i + '].aiReason'] = (s.reasons && s.reasons[0]) || 'AI 建议标重要';
          } else if (s.suggested === 'low' && p.importance !== 'low') {
            patch['quadrants.' + k + '[' + i + '].aiLow'] = true;
          }
        });
      });
      if (Object.keys(patch).length) that.setData(patch);
    }, function () {});
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
