// pages/stats/stats.js - 年度报告（聚合统计，隐私优先：不含取件码/标题/备注等明细）
var api = require('../../utils/api');

var PLATFORM_LABEL = {
  wechat: '公众号', xiaohongshu: '小红书', douyin: '抖音',
  bilibili: 'B站', zhihu: '知乎', web: '网页'
};
var TYPE_LABEL = { pickup: '取件', todo: '备忘', debt: '待还', medication: '用药', read: '待读' };

Page({
  data: {
    year: 0,
    years: [],
    loading: true,
    error: '',
    cards: [],
    monthly: [],
    maxMonthly: 1,
    types: [],
    medTotal: 0,
    medPlans: 0,
    medMonthly: [],
    medMax: 1,
    readDone: 0,
    readTotal: 0,
    platforms: [],
    tags: [],
    members: [],
    memberMax: 1
  },

  onLoad: function () {
    var y = new Date().getFullYear();
    var years = [];
    for (var i = 0; i < 3; i++) years.push(y - i);
    this.setData({ years: years, year: y });
    this.load(y);
  },

  onYearChange: function (e) {
    var y = parseInt(e.detail.value, 10);
    if (!y || y === this.data.year) return;
    this.setData({ year: y, loading: true, error: '' });
    this.load(y);
  },

  onRetry: function () {
    this.setData({ loading: true, error: '' });
    this.load(this.data.year);
  },

  load: function (year) {
    var that = this;
    api.request('GET', '/api/stats/annual?year=' + year, {}, function (data) {
      var r = (data && data.records) || {};
      var med = (data && data.med) || {};
      var read = (data && data.read) || {};

      var monthly = r.monthly || [];
      var maxMonthly = 1;
      monthly.forEach(function (m) { maxMonthly = Math.max(maxMonthly, m.created, m.done); });
      // 柱状高度按比例（px，最高 120）
      monthly = monthly.map(function (m) {
        return {
          month: m.month,
          created: m.created,
          done: m.done,
          ch: Math.round((m.created / maxMonthly) * 110) + 4,
          dh: Math.round((m.done / maxMonthly) * 110) + 4
        };
      });

      var types = [];
      var byType = r.byType || {};
      Object.keys(byType).forEach(function (k) {
        if (byType[k] > 0) types.push({ label: TYPE_LABEL[k] || k, count: byType[k] });
      });
      types.sort(function (a, b) { return b.count - a.count; });

      var medMonthly = (med.logsByMonth || []).filter(function (m) { return m.taken > 0; });
      var medMax = 1;
      medMonthly.forEach(function (m) { medMax = Math.max(medMax, m.taken); });
      medMonthly = medMonthly.map(function (m) {
        return { month: m.month, taken: m.taken, h: Math.round((m.taken / medMax) * 110) + 4 };
      });

      var platforms = [];
      var byPlatform = read.byPlatform || {};
      Object.keys(byPlatform).forEach(function (k) {
        if (byPlatform[k] > 0) platforms.push({ label: PLATFORM_LABEL[k] || k, count: byPlatform[k] });
      });
      platforms.sort(function (a, b) { return b.count - a.count; });

      var members = (data && data.members) || [];
      var memberMax = 1;
      members.forEach(function (m) { memberMax = Math.max(memberMax, m.count); });
      members = members.map(function (m) {
        return { name: m.name, count: m.count, w: Math.round((m.count / memberMax) * 100) };
      });

      that.setData({
        loading: false,
        cards: [
          { n: r.createdThisYear || 0, label: '本年新增' },
          { n: r.doneThisYear || 0, label: '本年完成' },
          { n: r.pending || 0, label: '进行中' },
          { n: read.addedThisYear || 0, label: '新增待读' }
        ],
        monthly: monthly,
        maxMonthly: maxMonthly,
        types: types,
        medTotal: med.logsTotal || 0,
        medPlans: med.activePlans || 0,
        medMonthly: medMonthly,
        medMax: medMax,
        readDone: read.done || 0,
        readTotal: read.total || 0,
        platforms: platforms,
        tags: (data && data.topTags) || [],
        members: members
      });
    }, function (err) {
      that.setData({ loading: false, error: (err && err.message) || '加载失败' });
    });
  }
});
