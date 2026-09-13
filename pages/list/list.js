// pages/list/list.js
var api = require('../../utils/api');
var helpers = require('../../utils/helpers');
var app = getApp();

Page({
  data: {
    recordType: 'all',
    filter: 'all',
    importanceFilter: 'all',
    urgencyFilter: 'all',
    group: 'none',
    search: '',
    list: [],
    groups: [],
    impOptions: ['重要性：全部', '🔴 高', '🟡 中', '⚪ 低'],
    impIndex: 0,
    urgOptions: ['紧迫性：全部', '⚡ 紧急', '🕐 普通'],
    urgIndex: 0,
    groupOptions: ['不分组', '按成员', '按待办类型'],
    groupIndex: 0,
    emptyEmoji: '📋',
    emptyTitle: '当前没有记录',
    emptyDesc: '点击右下角 + 添加',
    batchMode: false,
    batchCount: 0
  },

  onLoad: function () {
    var gd = app.globalData;
    this.setData({
      recordType: gd.recordType || 'all',
      filter: gd.filter || 'all',
      importanceFilter: gd.importanceFilter || 'all',
      urgencyFilter: gd.urgencyFilter || 'all',
      group: gd.group || 'none',
      impIndex: ['all', 'high', 'medium', 'low'].indexOf(gd.importanceFilter || 'all'),
      urgIndex: ['all', 'urgent', 'normal'].indexOf(gd.urgencyFilter || 'all'),
      groupIndex: ['none', 'owner', 'type'].indexOf(gd.group || 'none')
    });
    api.setToken(gd.token);
  },
  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    if (this.getTabBar) this.getTabBar().setData({ active: 1 });
    var that = this;
    app.refreshState(function () { that.computeList(); });
  },
  onPullDownRefresh: function () {
    var that = this;
    app.refreshState(function () { that.computeList(); wx.stopPullDownRefresh(); });
  },

  computeList: function () {
    var gd = app.globalData;
    var pkgs = (gd.packages || []).map(function (p) { return helpers.decorate(p, gd.members); });


    if (this.data.recordType !== 'all') pkgs = pkgs.filter(function (p) { return p.type === this.data.recordType; }.bind(this));
    if (this.data.filter === 'pending') pkgs = pkgs.filter(function (p) { return p.status === 'pending'; });
    else if (this.data.filter === 'picked') pkgs = pkgs.filter(function (p) { return p.status === 'picked'; });
    else if (this.data.filter === 'overdue') pkgs = pkgs.filter(function (p) { return p.overdue; });
    if (this.data.importanceFilter !== 'all') pkgs = pkgs.filter(function (p) { return p.importance === this.data.importanceFilter; }.bind(this));
    if (this.data.urgencyFilter !== 'all') pkgs = pkgs.filter(function (p) { return p.urgency === this.data.urgencyFilter; }.bind(this));
    var kw = this.data.search.trim().toLowerCase();
    if (kw) pkgs = pkgs.filter(function (p) {
      return (p.code || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.station || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.trackingNo || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.owner || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.company || '').toLowerCase().indexOf(kw) >= 0;
    });
    pkgs = helpers.sortPackages(pkgs);

    var groups = [];
    if (this.data.group !== 'none' && pkgs.length) {
      var keyOf = this.data.group === 'owner' ? function (p) { return p.owner || '未指定'; } : function (p) { return p.type === 'pickup' ? '📦 取件' : '📝 备忘'; };
      var map = {}, order = [];
      pkgs.forEach(function (p) {
        var k = keyOf(p);
        if (!map[k]) { map[k] = []; order.push(k); }
        map[k].push(p);
      });
      order.forEach(function (k) { groups.push({ key: k, items: map[k] }); });
    }

    var emptyMap = { all: ['📋', '当前没有记录', '点击右下角 + 添加'], pending: ['⏳', '没有待办', '做得不错'], picked: ['✅', '没有已完成', '完成后点击 ✓ 归档'], overdue: ['⚠️', '没有逾期', '没有需要处理的'] };
    var em = emptyMap[this.data.filter] || emptyMap.all;

    this.setData({ list: pkgs, groups: groups, emptyEmoji: em[0], emptyTitle: em[1], emptyDesc: em[2] });
  },

  switchType: function (e) {
    var t = e.currentTarget.dataset.type;
    app.globalData.recordType = t;
    this.setData({ recordType: t });
    this.computeList();
  },
  switchFilter: function (e) {
    this.setData({ filter: e.currentTarget.dataset.filter });
    this.computeList();
  },
  onSearch: function (e) { this.setData({ search: e.detail.value }); this.computeList(); },
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
    var vals = ['none', 'owner', 'type'];
    app.globalData.group = vals[idx];
    this.setData({ groupIndex: idx, group: vals[idx] });
    this.computeList();
  },
  onTogglePick: function (e) {
    var id = e.currentTarget.dataset.id;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg) return;
    var that = this;
    if (pkg.status === 'pending') {
      api.updatePackage(id, { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me }, function () {
        that.computeList();
        wx.showToast({ title: '已完成', icon: 'success' });
      });
    } else {
      api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, function () { that.computeList(); });
    }
  },
  onCardTap: function (e) {
    var id = e.currentTarget.dataset.id;
    if (this.data.batchMode) {
      this.onToggleBatchSelect(id);
    } else {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
    }
  },
  onToggleBatch: function () {
    if (this.data.batchMode) {
      this.onExitBatch();
    } else {
      this.enterBatchMode();
    }
  },
  enterBatchMode: function () {
    var list = (this.data.list || []).map(function (p) { return Object.assign({}, p, { batchSelected: false }); });
    var groups = (this.data.groups || []).map(function (g) {
      return Object.assign({}, g, { items: g.items.map(function (p) { return Object.assign({}, p, { batchSelected: false }); }) });
    });
    this.setData({ batchMode: true, list: list, groups: groups, batchCount: 0 });
  },
  onExitBatch: function () {
    var list = (this.data.list || []).map(function (p) { delete p.batchSelected; return p; });
    var groups = (this.data.groups || []).map(function (g) {
      return Object.assign({}, g, { items: g.items.map(function (p) { delete p.batchSelected; return p; }) });
    });
    this.setData({ batchMode: false, list: list, groups: groups, batchCount: 0 });
  },
  onToggleBatchSelect: function (id) {
    var self = this;
    var list = (this.data.list || []).map(function (p) {
      if (p.id === id) { var c = Object.assign({}, p); c.batchSelected = !c.batchSelected; return c; }
      return p;
    });
    var groups = (this.data.groups || []).map(function (g) {
      return Object.assign({}, g, { items: g.items.map(function (p) {
        if (p.id === id) { var c = Object.assign({}, p); c.batchSelected = !c.batchSelected; return c; }
        return p;
      }) });
    });
    var all = list.length ? list : groups.reduce(function (a, g) { return a.concat(g.items); }, []);
    var count = all.filter(function (p) { return p.batchSelected; }).length;
    this.setData({ list: list, groups: groups, batchCount: count });
  },
  onSelectAll: function () {
    var allSelected = this.data.batchCount === (this.data.list.length || 1);
    var newVal = !allSelected;
    var list = (this.data.list || []).map(function (p) { return Object.assign({}, p, { batchSelected: newVal }); });
    var groups = (this.data.groups || []).map(function (g) {
      return Object.assign({}, g, { items: g.items.map(function (p) { return Object.assign({}, p, { batchSelected: newVal }); }) });
    });
    var allItems = list.length ? list : groups.reduce(function (a, g) { return a.concat(g.items); }, []);
    var count = allItems.filter(function (p) { return p.batchSelected; }).length;
    this.setData({ list: list, groups: groups, batchCount: count });
  },
  onBatchPick: function () {
    var self = this;
    var all = (this.data.list.length ? this.data.list : (this.data.groups || []).reduce(function (a, g) { return a.concat(g.items); }, []));
    var ids = all.filter(function (p) { return p.batchSelected && p.status === 'pending'; }).map(function (p) { return p.id; });
    if (!ids.length) { wx.showToast({ title: '没有可选记录', icon: 'none' }); return; }
    wx.showModal({
      title: '批量完成',
      content: '将 ' + ids.length + ' 条记录标记为完成？',
      success: function (res) {
        if (res.confirm) {
          var done = 0;
          ids.forEach(function (id) {
            api.updatePackage(id, { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me }, function () {
              done++;
              if (done === ids.length) {
                self.onExitBatch();
                self.computeList();
                wx.showToast({ title: '已完成 ' + ids.length + ' 条', icon: 'success' });
              }
            });
          });
        }
      }
    });
  },
  onBatchDelete: function () {
    var self = this;
    var all = (this.data.list.length ? this.data.list : (this.data.groups || []).reduce(function (a, g) { return a.concat(g.items); }, []));
    var ids = all.filter(function (p) { return p.batchSelected; }).map(function (p) { return p.id; });
    if (!ids.length) { wx.showToast({ title: '没有可选记录', icon: 'none' }); return; }
    wx.showModal({
      title: '批量删除',
      content: '确认删除 ' + ids.length + ' 条记录？此操作不可恢复',
      confirmColor: '#ef4444',
      success: function (res) {
        if (res.confirm) {
          var done = 0;
          ids.forEach(function (id) {
            api.deletePackage(id, function () {
              done++;
              if (done === ids.length) {
                self.onExitBatch();
                self.computeList();
                wx.showToast({ title: '已删除 ' + ids.length + ' 条', icon: 'success' });
              }
            });
          });
        }
      }
    });
  },
  onQuickPick: function (e) {
    var id = e.currentTarget.dataset.id;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg) return;
    var that = this;
    if (pkg.status === 'pending') {
      api.updatePackage(id, { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me }, function () {
        app.refreshState(function () { that.computeList(); });
        wx.showToast({ title: '已完成', icon: 'success' });
      });
    } else {
      api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, function () {
        app.refreshState(function () { that.computeList(); });
      });
    }
  },
  onEdit: function (e) { wx.navigateTo({ url: '/pages/add/add?id=' + e.currentTarget.dataset.id }); },
  onCopy: function (e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.code, success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
  },
  onAdd: function () { wx.navigateTo({ url: '/pages/add/add' }); }
});
