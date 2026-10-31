// pages/overview/overview.js
var api = require('../../utils/api');
var helpers = require('../../utils/helpers');
var heatmap = require('../../utils/heatmap');
var app = getApp();

Page({
  data: {
    stats: {},
    greetingText: '',
    todayStr: '',
    quadrantCounts: { q1: 0, q2: 0, q3: 0, q4: 0 },
    todayActs: [],
    searchKeyword: '',
    heatWeeks: [],
    heatMonths: [],
    activeDays: 0,
    heatTotal: 0
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
    this.loadHeat();
  },

  // 使用活跃度热力图（当年，轻量接口；失败静默隐藏，不打扰首页）
  loadHeat: function () {
    var that = this;
    var y = new Date().getFullYear();
    api.request('GET', '/api/stats/activity?year=' + y, {}, function (data) {
      var heat = heatmap.buildHeatmap((data && data.activity) || [], y);
      that.setData({
        heatWeeks: heat.weeks,
        heatMonths: heat.months,
        activeDays: heat.activeDays,
        heatTotal: heat.total
      });
    }, function () {});
  },

  onHeatTap: function (e) {
    var ds = e.currentTarget.dataset.date;
    var c = parseInt(e.currentTarget.dataset.count, 10) || 0;
    if (!ds) return;
    var label = parseInt(ds.slice(5, 7), 10) + '月' + parseInt(ds.slice(8, 10), 10) + '日';
    wx.showToast({ title: c ? label + ' · ' + c + ' 条动态' : label + ' · 未使用', icon: 'none' });
  },

  compute: function () {
    var gd = app.globalData;
    var pkgs = (gd.packages || []).map(function (p) { return helpers.decorate(p, gd.members); });
    // 待读是个人阅读 Tab 的内容，不进概览的四象限与动态流
    var homePkgs = pkgs.filter(function (p) { return p.type !== 'read'; });

    // 四象限统计
    var quadPkgs = homePkgs.filter(function (p) { return p.status === 'pending'; });
    var counts = { q1: 0, q2: 0, q3: 0, q4: 0 };
    quadPkgs.forEach(function (p) {
      var important = (p.importance || 'medium') === 'high';
      var urgent = (p.urgency || 'normal') === 'urgent';
      if (important && urgent) counts.q1++;
      else if (important && !urgent) counts.q2++;
      else if (!important && urgent) counts.q3++;
      else counts.q4++;
    });

    // 最近动态（近 72h 新增/完成，按时间倒序取前 8；带"今天/昨天/日期"标签）
    var now = new Date();
    var dayMs = 24 * 3600 * 1000;
    var cutoff = new Date(now.getTime() - 3 * dayMs);
    var todayPrefix = now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2);
    var yest = new Date(now.getTime() - dayMs);
    var yestPrefix = yest.getFullYear() + '-' + ('0' + (yest.getMonth() + 1)).slice(-2) + '-' + ('0' + yest.getDate()).slice(-2);
    function dayLabelOf(iso) {
      if (!iso) return '';
      if (iso.indexOf(todayPrefix) === 0) return '今天';
      if (iso.indexOf(yestPrefix) === 0) return '昨天';
      var t = new Date(iso);
      return (t.getMonth() + 1) + '月' + t.getDate() + '日';
    }
    var acts = [];
    homePkgs.forEach(function (p) {
      if (p.createdAt && new Date(p.createdAt).getTime() >= cutoff.getTime()) {
        acts.push({ id: p.id + ':new', pkgId: p.id, time: p.createdAt, dayLabel: dayLabelOf(p.createdAt), iconName: p.type === 'pickup' ? 'box' : (p.type === 'debt' ? 'creditcard' : (p.type === 'medication' ? 'pill' : 'clipboard')),
          text: '新增「' + (p.summaryText || p.title || p.code || '') + '」', cls: 'act-new' });
      }
      if (p.status === 'picked' && p.pickedAt && new Date(p.pickedAt).getTime() >= cutoff.getTime()) {
        acts.push({ id: p.id + ':done', pkgId: p.id, time: p.pickedAt, dayLabel: dayLabelOf(p.pickedAt), iconName: 'check-circle', iconColor: '#10B981',
          text: '完成「' + (p.summaryText || p.title || p.code || '') + '」', cls: 'act-done' });
      }
    });
    acts.sort(function (a, b) { return b.time.localeCompare(a.time); });
    var todayActs = acts.slice(0, 8).map(function (a) {
      var t = new Date(a.time);
      a._time = a.dayLabel + ' ' + ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2);
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
  onGoQuadrant: function () { wx.navigateTo({ url: '/pages/quadrant/quadrant' }); },
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
    wx.navigateTo({ url: '/pages/quadrant/quadrant' });
  },
  onShareAppMessage: function () {
    return { title: '屋事小记 - 家庭快递取件码共享', path: '/pages/overview/overview' };
  },
  onShareTimeline: function () {
    return { title: '屋事小记 - 家庭快递取件码共享' };
  }
});
