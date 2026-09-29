// pages/quadrant/quadrant.js
var helpers = require('../../utils/helpers');
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

  onGoAll: function () {
    wx.switchTab({ url: '/pages/list/list' });
  }
});
