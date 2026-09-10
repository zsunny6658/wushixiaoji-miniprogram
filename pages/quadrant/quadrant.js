// pages/quadrant/quadrant.js
var helpers = require('../../utils/helpers');
var app = getApp();

Page({
  data: {
    focusQuad: '',
    focusTitle: '',
    focusHint: '',
    quadrants: { q1: [], q2: [], q3: [], q4: [] },
    totalCount: 0,
    recentItems: []
  },

  onGoBack: function () {
    this.setData({ focusQuad: '' });
  },

  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    // tabbar 页：从概览钻取时 onLoad 不会再触发，需在 onShow 读取 _focusQuad
    var quad = app.globalData._focusQuad || '';
    app.globalData._focusQuad = '';
    if (quad) {
      var titles = {
        q1: { title: '重要且紧急', hint: '立即处理' },
        q2: { title: '重要不紧急', hint: '规划安排' },
        q3: { title: '不重要但紧急', hint: '委托/快速处理' },
        q4: { title: '不重要不紧急', hint: '可忽略' }
      };
      var t = titles[quad] || { title: '全部待办', hint: '' };
      this.setData({ focusQuad: quad, focusTitle: t.title, focusHint: t.hint });
    }
    var that = this;
    app.refreshState(function () { that.compute(); });
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
    var allPending = pending.slice();
    helpers.sortPackages(allPending);
    this.setData({
      quadrants: quads,
      totalCount: allPending.length,
      recentItems: allPending.slice(0, 5)
    });
  },

  onEdit: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  }
});
