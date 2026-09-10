// pages/index/index.js
var api = require('../../utils/api');
var app = getApp();

var COLORS = ['#4f6ef7', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
var IMP_RANK = { high: 0, medium: 1, low: 2 };
var URG_RANK = { urgent: 0, normal: 1 };

function fmtTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d)) return '';
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = Math.round((day - today) / 86400000);
  var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  if (diff === 0) return '今天 ' + hm;
  if (diff === -1) return '昨天 ' + hm;
  if (diff === 1) return '明天 ' + hm;
  if (diff >= -6 && diff <= 6) return diff > 0 ? '后天 ' + hm : (Math.abs(diff) === 2 ? '前天 ' + hm : '');
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}

function ownerColor(name, members) {
  if (!name || !members || !members.length) return COLORS[0];
  var idx = 0;
  for (var i = 0; i < members.length; i++) { if (members[i].name === name) { idx = i; break; } }
  return COLORS[idx % COLORS.length];
}

function isOverdue(p) {
  if (p.status !== 'pending' || !p.arrivedAt) return false;
  return new Date(p.arrivedAt).getTime() < Date.now();
}

function impLabel(imp) {
  return imp === 'high' ? '🔴重要' : imp === 'low' ? '⚪低' : '🟡中';
}
function urgLabel(urg) {
  return urg === 'urgent' ? '⚡紧急' : '🕐普通';
}

Page({
  data: {
    stats: {},
    viewMode: 'list',
    recordType: 'all',
    filter: 'all',
    importanceFilter: 'all',
    urgencyFilter: 'all',
    group: 'station',
    search: '',
    list: [],
    groups: [],
    quadrants: { q1: [], q2: [], q3: [], q4: [] },
    quadrantCounts: { q1: 0, q2: 0, q3: 0, q4: 0 },
    impOptions: ['重要性：全部', '🔴 高', '🟡 中', '⚪ 低'],
    impIndex: 0,
    urgOptions: ['紧迫性：全部', '⚡ 紧急', '🕐 普通'],
    urgIndex: 0,
    groupOptions: ['按驿站分组', '不分组', '按成员分组'],
    groupIndex: 0,
    emptyEmoji: '📋',
    emptyTitle: '当前没有记录',
    emptyDesc: '点击右下角 + 添加'
  },

  onLoad: function () {
    var gd = app.globalData;
    this.setData({
      viewMode: gd.viewMode || 'list',
      recordType: gd.recordType || 'all',
      filter: gd.filter || 'all',
      importanceFilter: gd.importanceFilter || 'all',
      urgencyFilter: gd.urgencyFilter || 'all',
      group: gd.group || 'station',
      impIndex: ['all', 'high', 'medium', 'low'].indexOf(gd.importanceFilter || 'all'),
      urgIndex: ['all', 'urgent', 'normal'].indexOf(gd.urgencyFilter || 'all'),
      groupIndex: ['station', 'none', 'owner'].indexOf(gd.group || 'station')
    });
    if (!gd.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    api.setToken(gd.token);
    this.refresh();
  },

  onShow: function () {
    if (app.globalData.token) this.refresh();
  },

  onPullDownRefresh: function () {
    var that = this;
    this.refresh(function () { wx.stopPullDownRefresh(); });
  },

  refresh: function (cb) {
    var that = this;
    app.refreshState(function () {
      that.setData({ stats: app.globalData.stats, quadrants: app.globalData.quadrants });
      that.computeList();
      cb && cb();
    });
  },

  computeList: function () {
    var gd = app.globalData;
    var pkgs = (gd.packages || []).map(function (p) {
      return Object.assign({}, p, {
        arrivedLabel: fmtTime(p.arrivedAt),
        pickedAtLabel: fmtTime(p.pickedAt),
        ownerColor: ownerColor(p.owner, gd.members || []),
        overdue: isOverdue(p),
        impLabel: impLabel(p.importance || 'medium'),
        urgLabel: urgLabel(p.urgency || 'normal'),
        importance: p.importance || 'medium',
        urgency: p.urgency || 'normal'
      });
    });

    // 类型过滤
    if (this.data.recordType !== 'all') {
      pkgs = pkgs.filter(function (p) { return p.type === this.data.recordType; }.bind(this));
    }
    // 状态过滤
    if (this.data.filter === 'pending') pkgs = pkgs.filter(function (p) { return p.status === 'pending'; });
    else if (this.data.filter === 'picked') pkgs = pkgs.filter(function (p) { return p.status === 'picked'; });
    else if (this.data.filter === 'overdue') pkgs = pkgs.filter(function (p) { return p.overdue; });
    // 重要性过滤
    if (this.data.importanceFilter !== 'all') pkgs = pkgs.filter(function (p) { return p.importance === this.data.importanceFilter; }.bind(this));
    // 紧迫性过滤
    if (this.data.urgencyFilter !== 'all') pkgs = pkgs.filter(function (p) { return p.urgency === this.data.urgencyFilter; }.bind(this));
    // 搜索
    var kw = this.data.search.trim().toLowerCase();
    if (kw) {
      pkgs = pkgs.filter(function (p) {
        return (p.code || '').toLowerCase().indexOf(kw) >= 0 ||
               (p.station || '').toLowerCase().indexOf(kw) >= 0 ||
               (p.trackingNo || '').toLowerCase().indexOf(kw) >= 0 ||
               (p.owner || '').toLowerCase().indexOf(kw) >= 0 ||
               (p.company || '').toLowerCase().indexOf(kw) >= 0;
      });
    }
    // 排序：pending 优先，重要×紧迫优先，到货时间倒序
    pkgs.sort(function (a, b) {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
      var ai = IMP_RANK[a.importance], bi = IMP_RANK[b.importance];
      if (ai !== bi) return ai - bi;
      var au = URG_RANK[a.urgency], bu = URG_RANK[b.urgency];
      if (au !== bu) return au - bu;
      return (b.arrivedAt || '').localeCompare(a.arrivedAt || '');
    });

    // 四象限（只看 pending）
    var quadPkgs = (gd.packages || []).filter(function (p) { return p.status === 'pending'; });
    if (this.data.recordType !== 'all') quadPkgs = quadPkgs.filter(function (p) { return p.type === this.data.recordType; }.bind(this));
    var quads = { q1: [], q2: [], q3: [], q4: [] };
    quadPkgs.forEach(function (p) {
      var important = (p.importance || 'medium') === 'high';
      var urgent = (p.urgency || 'normal') === 'urgent';
      var key = (important ? 'q1' : (urgent ? 'q3' : 'q4'));
      if (important && !urgent) key = 'q2';
      if (!important && !urgent) key = 'q4';
      if (!important && urgent) key = 'q3';
      if (important && urgent) key = 'q1';
      quads[key].push(Object.assign({}, p, {
        arrivedLabel: fmtTime(p.arrivedAt),
        ownerColor: ownerColor(p.owner, gd.members || []),
        overdue: isOverdue(p),
        impLabel: impLabel(p.importance || 'medium'),
        urgLabel: urgLabel(p.urgency || 'normal')
      }));
    });
    Object.keys(quads).forEach(function (k) {
      quads[k].sort(function (a, b) {
        var ai = IMP_RANK[a.importance], bi = IMP_RANK[b.importance];
        if (ai !== bi) return ai - bi;
        var au = URG_RANK[a.urgency], bu = URG_RANK[b.urgency];
        if (au !== bu) return au - bu;
        return (b.arrivedAt || '').localeCompare(a.arrivedAt || '');
      });
    });

    var groups = [];
    if (this.data.group !== 'none' && this.data.recordType !== 'todo' && pkgs.length) {
      var keyOf = this.data.group === 'owner'
        ? function (p) { return p.owner || '未指定'; }
        : function (p) { return p.station || '未知驿站'; };
      var map = {}, order = [];
      pkgs.forEach(function (p) {
        var k = keyOf(p);
        if (!map[k]) { map[k] = []; order.push(k); }
        map[k].push(p);
      });
      order.forEach(function (k) { groups.push({ key: k, items: map[k] }); });
    }

    var emptyMap = {
      all: ['📋', '当前没有记录', '点击右下角 + 添加'],
      pending: ['⏳', '没有待处理', '做得不错'],
      picked: ['✅', '没有已完成', '完成后点击 ✓ 归档'],
      overdue: ['⚠️', '没有逾期', '没有需要处理的']
    };
    var em = emptyMap[this.data.filter] || emptyMap.all;

    this.setData({
      list: pkgs,
      groups: groups,
      quadrants: quads,
      quadrantCounts: { q1: quads.q1.length, q2: quads.q2.length, q3: quads.q3.length, q4: quads.q4.length },
      emptyEmoji: em[0],
      emptyTitle: em[1],
      emptyDesc: em[2]
    });
  },

  switchView: function (e) {
    var v = e.currentTarget.dataset.view;
    app.globalData.viewMode = v;
    wx.setStorageSync('parcel.viewMode', v);
    this.setData({ viewMode: v });
  },
  switchType: function (e) {
    var t = e.currentTarget.dataset.type;
    app.globalData.recordType = t;
    wx.setStorageSync('parcel.recordType', t);
    this.setData({ recordType: t });
    this.computeList();
  },
  switchFilter: function (e) {
    var f = e.currentTarget.dataset.filter;
    app.globalData.filter = f;
    this.setData({ filter: f });
    this.computeList();
  },
  onSearch: function (e) {
    this.setData({ search: e.detail.value });
    this.computeList();
  },
  onImpChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['all', 'high', 'medium', 'low'];
    app.globalData.importanceFilter = vals[idx];
    this.setData({ impIndex: idx, importanceFilter: vals[idx] });
    this.computeList();
  },
  onUrgChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['all', 'urgent', 'normal'];
    app.globalData.urgencyFilter = vals[idx];
    this.setData({ urgIndex: idx, urgencyFilter: vals[idx] });
    this.computeList();
  },
  onGroupChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['station', 'none', 'owner'];
    app.globalData.group = vals[idx];
    wx.setStorageSync('parcel.group', vals[idx]);
    this.setData({ groupIndex: idx, group: vals[idx] });
    this.computeList();
  },
  onTogglePick: function (e) {
    var id = e.currentTarget.dataset.id;
    var pkg = app.globalData.packages.find(function (p) { return p.id === id; });
    if (!pkg) return;
    var that = this;
    if (pkg.status === 'pending') {
      api.updatePackage(id, { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me }, function () {
        that.refresh();
        wx.showToast({ title: '已完成', icon: 'success' });
      });
    } else {
      api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, function () {
        that.refresh();
      });
    }
  },
  onEdit: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/add/add?id=' + id });
  },
  onCardTap: function (e) {
    var id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: '/pages/add/add?id=' + id });
  },
  onCopy: function (e) {
    var code = e.currentTarget.dataset.code;
    wx.setClipboardData({ data: code, success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
  },
  onAdd: function () {
    wx.navigateTo({ url: '/pages/add/add' });
  }
});
