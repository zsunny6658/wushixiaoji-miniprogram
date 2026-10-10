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
    latestPending: [],
    todayActs: [],
    searchKeyword: ''
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
    }, { force: true });
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
      p._iconName = p.importance === 'high' ? 'flag' : (p.type === 'pickup' ? 'box' : (p.type === 'debt' ? 'creditcard' : (p.type === 'medication' ? 'pill' : 'clipboard')));
      p._iconColor = p.importance === 'high' ? '#EF4444' : '#718096';
      p._text = p.summaryText || p.title || p.code;
      p._time = p.arrivedLabel;
      p._flagged = p.importance === 'high';
    });

    // 今日动态（今日新增 / 今日完成，按时间倒序取前 5）
    var nd = new Date();
    var todayPrefix = nd.getFullYear() + '-' + ('0' + (nd.getMonth() + 1)).slice(-2) + '-' + ('0' + nd.getDate()).slice(-2);
    var acts = [];
    pkgs.forEach(function (p) {
      if (p.createdAt && p.createdAt.indexOf(todayPrefix) === 0) {
        acts.push({ id: p.id + ':new', time: p.createdAt, iconName: p.type === 'pickup' ? 'box' : (p.type === 'debt' ? 'creditcard' : (p.type === 'medication' ? 'pill' : 'clipboard')),
          text: '新增「' + (p.summaryText || p.title || p.code || '') + '」', cls: 'act-new' });
      }
      if (p.status === 'picked' && p.pickedAt && p.pickedAt.indexOf(todayPrefix) === 0) {
        acts.push({ id: p.id + ':done', time: p.pickedAt, iconName: 'check-circle', iconColor: '#10B981',
          text: '完成「' + (p.summaryText || p.title || p.code || '') + '」', cls: 'act-done' });
      }
    });
    acts.sort(function (a, b) { return b.time.localeCompare(a.time); });
    var todayActs = acts.slice(0, 5).map(function (a) {
      var t = new Date(a.time);
      a._time = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
      return a;
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

    // 直接信任后端 stats（避免本地重复计算）
    var s = gd.stats || {};
    var todoC = s.todo || 0;
    var pickupC = s.pickup || 0;
    var debtC = s.debt || 0;
    var medC = s.medication || 0;
    var debtTotal = s.debtTotal || 0;
    var overdueC = s.overdue || 0;
    var pickedC = s.picked || 0;
    var ignoredC = s.ignored || 0;
    var privateC = s.privateCount || 0;

    this.setData({
      stats: { todo: todoC, pickup: pickupC, debt: debtC, medication: medC, debtTotal: debtTotal, debtTotalLabel: helpers.formatAmount(debtTotal), overdue: overdueC, picked: pickedC, ignored: ignoredC, privateCount: privateC },
      quadrantCounts: counts,
      latestPending: latestPending,
      todayActs: todayActs,
      greetingText: greeting,
      todayStr: todayStr
    });
  },

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
  onGoMedication: function () {
    app.globalData._deepLinkFilter = { recordType: 'medication', filter: 'pending' };
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
  onSearchInput: function (e) {
    this.setData({ searchKeyword: e.detail.value });
  },
  onSearchGo: function () {
    var kw = (this.data.searchKeyword || '').trim();
    app.globalData._deepLinkFilter = { recordType: 'all', filter: 'all', searchQuery: kw };
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
