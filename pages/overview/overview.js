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
    todaySummary: null
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

    // 今日摘要
    var todayPkgs = pkgs.filter(function (p) { return p.status === 'pending' && helpers.isToday(p.arrivedAt); });
    var summary = null;
    if (todayPkgs.length > 0) {
      summary = {
        title: '今天有 ' + todayPkgs.length + ' 条待处理',
        desc: todayPkgs.length <= 3
          ? todayPkgs.map(function (p) { return (p.type === 'pickup' ? '📦' : '📝') + p.code; }).join('  ')
          : '前 ' + 3 + ' 条：' + todayPkgs.slice(0, 3).map(function (p) { return (p.type === 'pickup' ? '📦' : '📝') + p.code; }).join('  ') + ' 等'
      };
    }

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

    this.setData({
      stats: gd.stats || {},
      quadrantCounts: counts,
      todaySummary: summary,
      greetingText: greeting,
      todayStr: todayStr
    });
  },

  // 跳转到小记页对应筛选（先设状态再跳转，避免 switchTab 异步导致状态未生效）
  onGoPickup: function () { app.globalData.recordType = 'pickup'; app.globalData.filter = 'pending'; wx.switchTab({ url: '/pages/list/list' }); },
  onGoTodo: function () { app.globalData.recordType = 'todo'; app.globalData.filter = 'pending'; wx.switchTab({ url: '/pages/list/list' }); },
  onGoOverdue: function () { app.globalData.filter = 'overdue'; app.globalData.recordType = 'all'; wx.switchTab({ url: '/pages/list/list' }); },
  onGoDone: function () { app.globalData.filter = 'picked'; app.globalData.recordType = 'all'; wx.switchTab({ url: '/pages/list/list' }); },
  onGoQuadrant: function () { wx.switchTab({ url: '/pages/quadrant/quadrant' }); },
  onGoQuadrantDetail: function (e) {
    var quad = e.currentTarget.dataset.quad;
    app.globalData._focusQuad = quad;
    wx.switchTab({ url: '/pages/quadrant/quadrant' });
  }
});
