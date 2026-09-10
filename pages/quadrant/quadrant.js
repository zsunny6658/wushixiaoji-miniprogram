// pages/quadrant/quadrant.js
var helpers = require('../../utils/helpers');
var app = getApp();

Page({
  data: {
    activeQuad: 'all',
    activeQuadLabel: '全部待办',
    activeQuadHint: '',
    quadrants: { q1: [], q2: [], q3: [], q4: [] },
    totalCount: 0,
    displayList: []
  },

  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    var that = this;
    // 从概览钻取时读取 _focusQuad
    var quad = app.globalData._focusQuad || '';
    app.globalData._focusQuad = '';
    if (quad) this.setData({ activeQuad: quad });
    app.refreshState(function () { that.compute(); });
  },

  onSwitchQuad: function (e) {
    var quad = e.currentTarget.dataset.quad;
    var labels = {
      all: { label: '全部待办', hint: '' },
      q1: { label: '重要且紧急', hint: '立即处理' },
      q2: { label: '重要不紧急', hint: '规划安排' },
      q3: { label: '不重要但紧急', hint: '快速处理' },
      q4: { label: '不重要不紧急', hint: '可忽略' }
    };
    var t = labels[quad] || labels.all;
    this.setData({ activeQuad: quad, activeQuadLabel: t.label, activeQuadHint: t.hint });
    this.compute();
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

    // 根据当前 tab 计算展示列表
    var displayList;
    if (this.data.activeQuad === 'all') {
      displayList = allPending;
    } else {
      displayList = quads[this.data.activeQuad] || [];
    }

    this.setData({
      quadrants: quads,
      totalCount: allPending.length,
      displayList: displayList
    });
  },

  onEdit: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  onGoAll: function () {
    wx.switchTab({ url: '/pages/list/list' });
  }
});
