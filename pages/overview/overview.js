// pages/overview/overview.js
var api = require('../../utils/api');
var helpers = require('../../utils/helpers');
var app = getApp();

Page({
  data: {
    stats: {},
    greetingText: '',
    todayStr: '',
    quadrantCounts: { q1: 0, q2: 0, q3: 0, q4: 0 },
    latestPending: []
  },

  onLoad: function () {
    api.setToken(app.globalData.token);
  },
  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    if (this.getTabBar) this.getTabBar().setData({ active: 0 });
    this.refresh();
  },
  onPullDownRefresh: function () {
    var that = this;
    app.refreshState(function () {
      that.compute();
      wx.stopPullDownRefresh();
    });
  },

  refresh: function () {
    var that = this;
    app.refreshState(function () {
      that.compute();
    });
  },

  compute: function () {
    var gd = app.globalData;
    var pkgs = (gd.packages || []).map(function (p) { return helpers.decorate(p, gd.members); });

    // 四象限统计
    var quadPkgs = pkgs.filter(function (p) { return p.status === 'pending'; });
    var counts = { q1: 0, q2: 0, q3: 0, q4: 0 };
    quadPkgs.forEach(function (p) {
      var important = (p.importance || 'medium') === 'high';
      var urgent = (p.urgency || 'normal') === 'urgent';
      if (important && urgent) counts.q1++;
      else if (important && !urgent) counts.q2++;
      else if (!important && urgent) counts.q3++;
      else counts.q4++;
    });

    // 最新待办（按创建时间倒序，取前 5 条）
    var pendingPkgs = pkgs.filter(function (p) { return p.status === 'pending'; });
    helpers.sortPackages(pendingPkgs);
    var latestPending = pendingPkgs.slice(0, 5);
    latestPending.forEach(function (p) {
      p._icon = p.importance === 'high' ? '🚩' : (p.type === 'pickup' ? '📦' : (p.type === 'debt' ? '💳' : '📝'));
      p._text = p.summaryText || p.title || p.code;
      p._time = p.arrivedLabel;
      p._flagged = p.importance === 'high';
    });

    // 问候语
    var now = new Date();
    var hour = now.getHours();
    var greeting;
    if (hour < 6) greeting = '夜深了';
    else if (hour < 12) greeting = '早上好';
    else if (hour < 18) greeting = '下午好';
    else greeting = '晚上好';

    // 日期
    var weekMap = ['日', '一', '二', '三', '四', '五', '六'];
    var todayStr = (now.getMonth() + 1) + '月' + now.getDate() + '日 周' + weekMap[now.getDay()];

    // 本地计算统计（不依赖后端，确保准确）
    var todoC = pkgs.filter(function (p) { return p.type === 'todo' && p.status === 'pending'; }).length;
    var pickupC = pkgs.filter(function (p) { return p.type === 'pickup' && p.status === 'pending'; }).length;
    var debtC = pkgs.filter(function (p) { return p.type === 'debt' && p.status === 'pending'; }).length;
    var debtTotal = Math.round(pkgs.filter(function (p) { return p.type === 'debt' && p.status === 'pending'; }).reduce(function (s, p) { return s + (p.amount || 0); }, 0) * 100) / 100;
    var overdueC = pkgs.filter(function (p) { return p.overdue && p.status === 'pending'; }).length;
    var pickedC = pkgs.filter(function (p) { return p.status === 'picked'; }).length;
    var ignoredC = pkgs.filter(function (p) { return p.status === 'ignored'; }).length;
    var privateC = pkgs.filter(function (p) { return p.isPrivate && p.status === 'pending'; }).length;

    this.setData({
      stats: { todo: todoC, pickup: pickupC, debt: debtC, debtTotal: debtTotal, debtTotalLabel: helpers.formatAmount(debtTotal), overdue: overdueC, picked: pickedC, ignored: ignoredC, privateCount: privateC },
      quadrantCounts: counts,
      latestPending: latestPending,
      greetingText: greeting,
      todayStr: todayStr
    });
  },

  // 跳转到小记页对应筛选（用 _deepLinkFilter 一次性传递，list.js onShow 读取后清除）
  onGoPickup: function () {
    app.globalData._deepLinkFilter = { recordType: 'pickup', filter: 'pending' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoTodo: function () {
    app.globalData._deepLinkFilter = { recordType: 'todo', filter: 'pending' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoDebt: function () {
    app.globalData._deepLinkFilter = { recordType: 'debt', filter: 'pending' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoPrivate: function () {
    app.globalData._deepLinkFilter = { recordType: 'all', filter: 'pending', scope: 'personal' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoOverdue: function () {
    app.globalData._deepLinkFilter = { recordType: 'all', filter: 'overdue' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoDone: function () {
    app.globalData._deepLinkFilter = { recordType: 'all', filter: 'picked' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoIgnored: function () {
    app.globalData._deepLinkFilter = { recordType: 'all', filter: 'ignored' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoQuadrant: function () { wx.switchTab({ url: '/pages/quadrant/quadrant' }); },
  onGoPending: function () {
    app.globalData._deepLinkFilter = { recordType: 'all', filter: 'pending' };
    wx.switchTab({ url: '/pages/list/list' });
  },
  onGoDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },
  onGoQuadrantDetail: function (e) {
    var quad = e.currentTarget.dataset.quad;
    app.globalData._focusQuad = quad;
    wx.switchTab({ url: '/pages/quadrant/quadrant' });
  },
  onShareAppMessage: function () {
    return { title: '屋事小记 - 家庭快递取件码共享', path: '/pages/overview/overview' };
  },
  onShareTimeline: function () {
    return { title: '屋事小记 - 家庭快递取件码共享' };
  }
});
