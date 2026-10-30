// pages/stats/stats.js - 年度报告（聚合统计，隐私优先：不含取件码/标题/备注等明细）
var api = require('../../utils/api');

var PLATFORM_LABEL = {
  wechat: '公众号', xiaohongshu: '小红书', douyin: '抖音',
  bilibili: 'B站', zhihu: '知乎', web: '网页'
};
var TYPE_LABEL = { pickup: '取件', todo: '备忘', debt: '待还', medication: '用药', read: '待读' };

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

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
    memberMax: 1,
    heatWeeks: [],
    heatMonths: [],
    activeDays: 0,
    heatTotal: 0
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

      var heat = that.buildHeatmap(data.activity || [], year);

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
        members: members,
        heatWeeks: heat.weeks,
        heatMonths: heat.months,
        activeDays: heat.activeDays,
        heatTotal: heat.total
      });
    }, function (err) {
      that.setData({ loading: false, error: (err && err.message) || '加载失败' });
    });
  },

  // GitHub 风格活跃度热力图：列为周（周日起），行为周内 7 天；
  // 色阶按当年有动态天数的四分位划分，0 = 白色（未使用）
  buildHeatmap: function (activity, year) {
    var counts = activity.map(function (a) { return a.count; })
      .filter(function (c) { return c > 0; })
      .sort(function (a, b) { return a - b; });
    var pick = function (p) {
      return counts.length ? counts[Math.min(counts.length - 1, Math.floor(counts.length * p))] : 1;
    };
    var t1 = pick(0.25), t2 = pick(0.5), t3 = pick(0.75);
    var levelOf = function (c) {
      if (!c) return 0;
      if (c <= t1) return 1;
      if (c <= t2) return 2;
      if (c <= t3) return 3;
      return 4;
    };
    var today = todayStr();
    var CELL = 14, GAP = 4; // rpx
    var weeks = [];
    var months = [];
    var lastMonth = -1;
    var col = [];
    var seq = 0;
    var flush = function () {
      if (!col.length) return;
      weeks.push(col);
      var first = null;
      for (var k = 0; k < col.length; k++) {
        if (!col[k].blank) { first = col[k]; break; }
      }
      if (first) {
        var m = parseInt(first.date.slice(5, 7), 10);
        if (m !== lastMonth) {
          months.push({ label: m + '月', left: (weeks.length - 1) * (CELL + GAP) });
          lastMonth = m;
        }
      }
      col = [];
    };
    var lead = new Date(year, 0, 1).getDay(); // 1月1日是周几（0=周日）
    for (var i = 0; i < lead; i++) col.push({ blank: true, key: 'b' + (seq++) });
    activity.forEach(function (a) {
      col.push({
        key: 'd' + (seq++),
        date: a.date,
        count: a.count,
        level: levelOf(a.count),
        future: a.date > today
      });
      if (col.length === 7) flush();
    });
    if (col.length) {
      while (col.length < 7) col.push({ blank: true, key: 'b' + (seq++) });
      flush();
    }
    var total = activity.reduce(function (s, a) { return s + a.count; }, 0);
    return { weeks: weeks, months: months, activeDays: counts.length, total: total };
  },

  onHeatTap: function (e) {
    var ds = e.currentTarget.dataset.date;
    var c = parseInt(e.currentTarget.dataset.count, 10) || 0;
    if (!ds) return;
    var label = parseInt(ds.slice(5, 7), 10) + '月' + parseInt(ds.slice(8, 10), 10) + '日';
    wx.showToast({ title: c ? label + ' · ' + c + ' 条动态' : label + ' · 未使用', icon: 'none' });
  }
});
