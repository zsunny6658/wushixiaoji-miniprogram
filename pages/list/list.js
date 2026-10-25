// pages/list/list.js
var api = require('../../utils/api');
var helpers = require('../../utils/helpers');
var realtime = require('../../utils/realtime');
var app = getApp();

Page({
  data: {
    recordType: 'all',
    filter: 'all',
    scope: 'all',
    importanceFilter: 'all',
    urgencyFilter: 'all',
    group: 'type',
    search: '',
    sortOptions: ['最新优先', '按到期日', '按重要度'],
    sortIndex: 0,
    sortMode: 'newest',
    list: [],
    groups: [],
    impOptions: ['重要·全部', '重要·高', '重要·中', '重要·低'],
    impIndex: 0,
    urgOptions: ['紧迫·全部', '紧迫·紧急', '紧迫·普通'],
    urgIndex: 0,
    groupOptions: ['不分组', '按成员', '按类型'],
    typeOptions: ['全部', '取件', '备忘', '待还', '用药'],
    scopeOptions: ['全部', '👨‍👩‍👧 家庭', '🔒 个人'],
    scopeIndex: 0,
    groupIndex: 0,
    counts: { all: 0, pending: 0, picked: 0, overdue: 0, ignored: 0 },
    emptyEmoji: '📋',
    emptyTitle: '当前没有记录',
    emptyDesc: '点击右下角 + 添加',
    batchMode: false,
    showFilter: false,
    activeFilterCount: 0,
    batchCount: 0,
    loading: true,
    skeletonRows: [1, 2, 3, 4, 5],
    swipeTouchX: 0,
    swipeTouchY: 0,
    swipeOffset: 0,
    swipeId: ''
  },

  onLoad: function () {
    api.setToken(app.globalData.token);
    var sys = wx.getSystemInfoSync();
    this.setData({
      recordType: 'all',
      filter: 'all',
      scope: 'all',
      importanceFilter: 'all',
      urgencyFilter: 'all',
      group: app.globalData.group || 'type',
      impIndex: 0,
      urgIndex: 0,
      scopeIndex: 0,
      groupIndex: ['none', 'owner', 'type'].indexOf(app.globalData.group || 'type'),
      pxToRpx: 750 / sys.windowWidth
    });
    // 恢复上次选择的排序方式（默认最近添加，红旗始终置顶）
    var savedSort = wx.getStorageSync('fph_sortMode');
    var sortIdx = ['newest', 'due', 'importance'].indexOf(savedSort);
    if (sortIdx > 0) this.setData({ sortMode: savedSort, sortIndex: sortIdx });
    // SSE 连接状态黄条（首页列表最常看，断线要有感知）
    var that = this;
    this._unsubRt = realtime.subscribe(function () {}, function (st) {
      that.setData({ rtOff: st === 'offline' });
    });
  },
  onUnload: function () {
    if (this._unsubRt) { this._unsubRt(); this._unsubRt = null; }
    if (this._searchTimer) { clearTimeout(this._searchTimer); this._searchTimer = null; }
  },
  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    if (this.getTabBar) this.getTabBar().setData({ active: 1 });
    // 从概览钻取时读取筛选状态（一次性标记，读取后清除）
    var gd = app.globalData;
    if (gd._deepLinkFilter) {
      this.setData({
        recordType: gd._deepLinkFilter.recordType || 'all',
        filter: gd._deepLinkFilter.filter || 'all',
        scope: gd._deepLinkFilter.scope || 'all',
        scopeIndex: ['all', 'family', 'personal'].indexOf(gd._deepLinkFilter.scope || 'all'),
        impIndex: ['all', 'high', 'medium', 'low'].indexOf(gd._deepLinkFilter.importance || 'all'),
        urgIndex: ['all', 'urgent', 'normal'].indexOf(gd._deepLinkFilter.urgency || 'all'),
        importanceFilter: gd._deepLinkFilter.importance || 'all',
        urgencyFilter: gd._deepLinkFilter.urgency || 'all',
        search: gd._deepLinkFilter.searchQuery || ''
      });
      gd._deepLinkFilter = null;
      this.updateFilterBadge();
      // 深链带非默认筛选时自动展开抽屉
      if (this.data.activeFilterCount) this.setData({ showFilter: true });
    }
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

    // 待读有自己的 Tab，不混进小记列表
    pkgs = pkgs.filter(function (p) { return p.type !== 'read'; });

    if (this.data.recordType !== 'all') pkgs = pkgs.filter(function (p) { return p.type === this.data.recordType; }.bind(this));
    // 个人可见性过滤（后端已过滤，这里兜底）
    pkgs = pkgs.filter(function (p) {
      if (p.isPrivate && p.ownerId && p.ownerId !== app.globalData.meId && !app.globalData.isAdmin) return false;
      return true;
    });
    // 家庭/个人筛选
    if (this.data.scope === 'family') pkgs = pkgs.filter(function (p) { return !p.isPrivate; });
    else if (this.data.scope === 'personal') pkgs = pkgs.filter(function (p) { return p.isPrivate; });
    if (this.data.importanceFilter !== 'all') pkgs = pkgs.filter(function (p) { return p.importance === this.data.importanceFilter; }.bind(this));
    if (this.data.urgencyFilter !== 'all') pkgs = pkgs.filter(function (p) { return p.urgency === this.data.urgencyFilter; }.bind(this));
    var kw = this.data.search.trim().toLowerCase();
    if (kw) pkgs = pkgs.filter(function (p) {
      return (p.code || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.station || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.trackingNo || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.owner || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.company || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.institution || '').toLowerCase().indexOf(kw) >= 0 ||
             (p.title || '').toLowerCase().indexOf(kw) >= 0;
    });
    // 基于当前筛选条件（不含状态筛选）计算各状态计数，使数字随筛选变化
    var basePkgs = pkgs.slice();
    var counts = {
      // 'all' 视图排除归档/忽略后 = 待办 + 完成
      all: basePkgs.filter(function (p) { return p.status !== 'archived' && p.status !== 'ignored'; }).length,
      pending: basePkgs.filter(function (p) { return p.status === 'pending'; }).length,
      picked: basePkgs.filter(function (p) { return p.status === 'picked'; }).length,
      overdue: basePkgs.filter(function (p) { return p.overdue && p.status === 'pending'; }).length,
      ignored: basePkgs.filter(function (p) { return p.status === 'ignored'; }).length
    };
    // 应用状态筛选（影响列表显示，不影响上面的计数）
    // 'all' 只承接活跃生命周期：排除归档（专门页面）与忽略（专门 tab）；近期完成保留 7 天回顾窗口（到期自动归档）
    if (this.data.filter === 'all') pkgs = pkgs.filter(function (p) { return p.status !== 'archived' && p.status !== 'ignored'; });
    else if (this.data.filter === 'pending') pkgs = pkgs.filter(function (p) { return p.status === 'pending'; });
    else if (this.data.filter === 'picked') pkgs = pkgs.filter(function (p) { return p.status === 'picked'; });
    else if (this.data.filter === 'overdue') pkgs = pkgs.filter(function (p) { return p.overdue && p.status === 'pending'; });
    else if (this.data.filter === 'ignored') pkgs = pkgs.filter(function (p) { return p.status === 'ignored'; });
    pkgs = helpers.sortPackages(pkgs, this.data.sortMode);

    var groups = [];
    if (this.data.group !== 'none' && pkgs.length) {
      var keyOf = this.data.group === 'owner' ? function (p) { return p.owner || '未指定'; } : function (p) { return p.type === 'pickup' ? '📦 取件' : (p.type === 'debt' ? '💳 待还' : '📝 备忘'); };
      var map = {}, order = [];
      pkgs.forEach(function (p) {
        var k = keyOf(p);
        if (!map[k]) { map[k] = []; order.push(k); }
        map[k].push(p);
      });
      order.forEach(function (k) { groups.push({ key: k, items: map[k] }); });
    }

    var emptyMap = { all: ['📋', '当前没有记录', '点击右下角 + 添加'], pending: ['⏳', '没有待办', '做得不错'], picked: ['✅', '没有已完成', '完成后点击 ✓ 归档'], overdue: ['⚠️', '没有逾期', '没有需要处理的'], ignored: ['🚫', '没有已忽略的记录', '点击卡片进入详情可忽略'], debt: ['💳', '没有待还款项', '点击右下角 + 添加'] };
    var em = emptyMap[this.data.filter] || emptyMap.all;

    this.setData({ list: pkgs, groups: groups, counts: counts, loading: false, emptyEmoji: em[0], emptyTitle: em[1], emptyDesc: em[2] });
  },

  switchScope: function (e) {
    var s = e.currentTarget.dataset.scope;
    this.setData({ scope: s });
    this.updateFilterBadge();
    this.computeList();
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

  // 忽略：高频操作，直接执行不弹确认（撤销：切到「忽略」筛选恢复）
  onToggleIgnore: function (e) {
    var id = e.currentTarget.dataset.id;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg) return;
    var that = this;
    if (pkg.status === 'ignored') {
      this.optimisticUpdate(id, { status: 'pending' });
      api.updatePackage(id, { status: 'pending' }, null, function () {
        that.optimisticRollback(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      wx.showToast({ title: '已取消忽略', icon: 'success' });
    } else {
      var days = app.globalData.ignoreCleanupDays || 7;
      var toArch = app.globalData.ignoreCleanupMode === 'archive';
      this.optimisticUpdate(id, { status: 'ignored' });
      api.updatePackage(id, { status: 'ignored' }, null, function () {
        that.optimisticRollback(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      wx.showToast({ title: '已忽略，' + days + '天后' + (toArch ? '转入归档' : '自动删除'), icon: 'none' });
    }
  },
  // 长期忽略：创建规则，相似待办在有效期内自动忽略
  onLongIgnore: function (id) {
    var that = this;
    var options = [
      { label: '长期忽略 30 天 · 相似待办不再提醒', days: 30 },
      { label: '长期忽略 90 天 · 相似待办不再提醒', days: 90 },
      { label: '永久忽略 · 相似待办不再提醒', days: 0 }
    ];
    wx.showActionSheet({
      alertText: '选择长期忽略时长',
      itemList: options.map(function (o) { return o.label; }),
      success: function (res) {
        var opt = options[res.tapIndex];
        if (!opt) return;
        that.optimisticUpdate(id, { status: 'ignored' });
        api.ignoreWithRule(id, { durationDays: opt.days, threshold: 0.6 }, function () {
          that.computeList();
          wx.showToast({ title: opt.days === 0 ? '已永久忽略相似待办' : '已忽略并创建' + opt.days + '天规则', icon: 'success' });
        }, function () {
          that.optimisticRollback(id);
          wx.showToast({ title: '操作失败', icon: 'none' });
        });
      }
    });
  },
  // 滑动快捷操作
  onSwipePick: function (e) {
    var id = e.currentTarget.dataset.id;
    this.onQuickPick({ currentTarget: { dataset: { id: id } } });
    this.setData({ swipeOffset: 0, swipeId: '' });
  },
  onSwipeDelete: function (e) {
    var id = e.currentTarget.dataset.id;
    var that = this;
    wx.showModal({
      title: '确认删除',
      content: '此操作不可恢复，确认删除？',
      confirmColor: '#e53e3e',
      success: function (res) {
        if (res.confirm) {
          that.optimisticDelete([id]);
          api.deletePackage(id, function () {
            wx.showToast({ title: '已删除', icon: 'success' });
          }, function () {
            that.optimisticRollback(id);
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
    this.setData({ swipeOffset: 0, swipeId: '' });
  },

  // 搜索防抖：输入框立即回显，列表重算 250ms 内去抖（避免每 keystroke 全量过滤+setData）
  onSearch: function (e) {
    this.setData({ search: e.detail.value });
    var that = this;
    if (this._searchTimer) clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(function () { that.computeList(); }, 250);
  },
  onToggleFilter: function () { this.setData({ showFilter: !this.data.showFilter }); },
  // 徽标 = 非默认筛选条件数（范围/重要性/紧迫性/分组）
  updateFilterBadge: function () {
    var d = this.data;
    var n = (d.scope !== 'all' ? 1 : 0) + (d.impIndex > 0 ? 1 : 0) +
      (d.urgIndex > 0 ? 1 : 0) + (d.groupIndex > 0 ? 1 : 0);
    this.setData({ activeFilterCount: n });
  },
  onResetFilter: function () {
    app.globalData.importanceFilter = 'all';
    app.globalData.urgencyFilter = 'all';
    this.setData({
      scope: 'all', scopeIndex: 0,
      impIndex: 0, importanceFilter: 'all',
      urgIndex: 0, urgencyFilter: 'all',
      groupIndex: 0, group: 'none'
    });
    this.updateFilterBadge();
    this.computeList();
  },
  onImpChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['all', 'high', 'medium', 'low'];
    app.globalData.importanceFilter = vals[idx];
    this.setData({ impIndex: idx, importanceFilter: vals[idx] });
    this.updateFilterBadge();
    this.computeList();
  },
  onUrgChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['all', 'urgent', 'normal'];
    app.globalData.urgencyFilter = vals[idx];
    this.setData({ urgIndex: idx, urgencyFilter: vals[idx] });
    this.updateFilterBadge();
    this.computeList();
  },
  onGroupChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['none', 'owner', 'type'];
    app.globalData.group = vals[idx];
    this.setData({ groupIndex: idx, group: vals[idx] });
    this.updateFilterBadge();
    this.computeList();
  },
  onSortChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var vals = ['newest', 'due', 'importance'];
    var mode = vals[idx] || 'newest';
    this.setData({ sortIndex: idx, sortMode: mode });
    try { wx.setStorageSync('fph_sortMode', mode); } catch (err) { }
    this.computeList();
  },
  onTogglePick: function (e) {
    var id = e.currentTarget.dataset.id;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg) return;
    var that = this;
    if (pkg.status === 'pending') {
      var patch = { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me };
      this.optimisticUpdate(id, patch);
      api.updatePackage(id, patch, null, function () {
        that.optimisticRollback(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      wx.showToast({ title: '已完成', icon: 'success' });
    } else {
      this.optimisticUpdate(id, { status: 'pending', pickedAt: '', pickedBy: '' });
      api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, null, function () {
        that.optimisticRollback(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
    }
  },
  // 乐观更新：立即改 localData，不等 API 回调
  optimisticUpdate: function (id, patch) {
    var gd = app.globalData;
    var pkgs = gd.packages || [];
    for (var i = 0; i < pkgs.length; i++) {
      if (pkgs[i].id === id) {
        for (var k in patch) pkgs[i][k] = patch[k];
        break;
      }
    }
    helpers.invalidateDecorateCacheById(id);
    this.computeList();
  },
  // 乐观回滚：恢复 localData 原始状态
  optimisticRollback: function (id) {
    helpers.invalidateDecorateCacheById(id);
    this.computeList();
  },
  // 乐观删除：从列表移除
  optimisticDelete: function (ids) {
    var gd = app.globalData;
    var pkgs = gd.packages || [];
    gd.packages = pkgs.filter(function (p) {
      for (var i = 0; i < ids.length; i++) if (p.id === ids[i]) return false;
      return true;
    });
    helpers.invalidateDecorateCache();
    this.computeList();
  },

  // 滑动检测：左滑完成/撤销，右滑红旗/取消红旗
  onTouchStart: function (e) {
    if (this.data.batchMode) return;
    this._touchX = e.touches[0].clientX;
    this._touchY = e.touches[0].clientY;
    this._touchId = e.currentTarget.dataset.id;
    this._touchMoved = false;
    // 先收起其他已展开的卡片（左或右）
    if (this.data.swipeOffset !== 0 && this.data.swipeId !== this._touchId) {
      this.setData({ swipeOffset: 0, swipeId: '' });
    }
  },
  onTouchMove: function (e) {
    if (this.data.batchMode) return;
    if (!this._touchId) return;
    var deltaX = e.touches[0].clientX - this._touchX;
    var deltaY = Math.abs(e.touches[0].clientY - this._touchY);
    var p2r = this.data.pxToRpx || 2;
    if (Math.abs(deltaX) > 8 && Math.abs(deltaX) > deltaY) {
      if (!this._touchMoved) {
        this._touchMoved = true;
        this.setData({ swipeId: this._touchId });
      }
      this.setData({ swipeOffset: deltaX * p2r });
    }
  },
  onTouchEnd: function (e) {
    if (this.data.batchMode) { this.setData({ swipeOffset: 0, swipeId: '' }); this._touchMoved = false; return; }
    if (!this._touchId) { this._touchMoved = false; return; }
    var deltaX = e.changedTouches[0].clientX - this._touchX;
    var deltaY = Math.abs(e.changedTouches[0].clientY - this._touchY);
    if (this._touchMoved && Math.abs(deltaX) > 40 && Math.abs(deltaX) > deltaY * 1.5) {
      // 左滑展开完成按钮，右滑展开红旗按钮
      this.setData({ swipeOffset: deltaX > 0 ? 200 : -200, swipeId: this._touchId });
    } else {
      this.setData({ swipeOffset: 0, swipeId: '' });
    }
    this._touchMoved = false;
  },

  onSwipeFlag: function (e) {
    var id = e.currentTarget.dataset.id;
    var that = this;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg) return;
    var isFlagged = pkg.importance === 'high';
    var newImportance = isFlagged ? 'medium' : 'high';
    var patch = { importance: newImportance };
    that.optimisticUpdate(id, patch);
    api.updatePackage(id, patch, null, function () {
      that.optimisticRollback(id);
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
    that.setData({ swipeOffset: 0, swipeId: '' });
    wx.showToast({ title: isFlagged ? '已取消红旗' : '已标红旗', icon: 'success' });
  },

  onCardTap: function (e) {
    var id = e.currentTarget.dataset.id;
    // 如果有卡片已展开，点击其他位置先收起
    if (this.data.swipeOffset !== 0 && this.data.swipeId !== id) {
      this.setData({ swipeOffset: 0, swipeId: '' });
      return;
    }
    // 点击已展开的卡片，收起
    if (this.data.swipeId === id && this.data.swipeOffset !== 0) {
      this.setData({ swipeOffset: 0, swipeId: '' });
      return;
    }
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
    // 批量模式下左滑手势禁用，先收起已展开的滑动卡片避免视觉冲突
    this.setData({ batchMode: true, list: list, groups: groups, batchCount: 0, swipeOffset: 0, swipeId: '' });
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
    var ids = all.filter(function (p) { return p.batchSelected && p.status === 'pending' && p.type !== 'medication'; }).map(function (p) { return p.id; });
    if (!ids.length) {
      wx.showToast({ title: '用药记录请在药板打卡', icon: 'none' });
      return;
    }
    if (!ids.length) { wx.showToast({ title: '没有可选记录', icon: 'none' }); return; }
    wx.showModal({
      title: '批量完成',
      content: '将 ' + ids.length + ' 条记录标记为完成？',
      success: function (res) {
        if (res.confirm) {
          var now = new Date().toISOString();
          var me = app.globalData.me;
          var rollback = [];
          ids.forEach(function (id) {
            var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
            if (!pkg) return;
            rollback.push({ id: id, prev: Object.assign({}, pkg) });
            self.optimisticUpdate(id, { status: 'picked', pickedAt: now, pickedBy: me });
            api.updatePackage(id, { status: 'picked', pickedAt: now, pickedBy: me });
          });
          self.onExitBatch();
          self.computeList();
          wx.showToast({ title: '已完成 ' + ids.length + ' 条', icon: 'success' });
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
          var rollback = [];
          ids.forEach(function (id) {
            var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
            if (pkg) rollback.push({ id: id, prev: Object.assign({}, pkg) });
          });
          self.optimisticDelete(ids);
          var done = 0;
          ids.forEach(function (id) {
            api.deletePackage(id, function () {
              done++;
              if (done === ids.length) {
                self.onExitBatch();
                self.computeList();
                wx.showToast({ title: '已删除 ' + ids.length + ' 条', icon: 'success' });
              }
            }, function () {
              if (done === ids.length - 1) {
                self.optimisticRollback(ids);
              }
            });
          });
        }
      }
    });
  },
  onCardLongPress: function (e) {
    if (this.data.batchMode) return;
    var id = e.currentTarget.dataset.id;
    var that = this;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg) return;
    var isPicked = pkg.status === 'picked';
    var isIgnored = pkg.status === 'ignored';
    var isMed = pkg.type === 'medication';
    var pickLabel = isPicked ? '↩ 撤销完成' : (isMed ? '💊 打卡服药' : '✓ 标记完成');
    var ignoreLabel = isIgnored ? '📌 恢复显示' : '🚫 忽略此条';
    var items = [pickLabel, ignoreLabel];
    if (!isIgnored) items.push('🔕 长期忽略…');
    items.push('🗑 删除记录');
    wx.showActionSheet({
      itemList: items,
      itemColor: '#4f6ef7',
      success: function (res) {
        var label = items[res.tapIndex];
        if (label === pickLabel) {
          that.onQuickPick({ currentTarget: { dataset: { id: id } } });
        } else if (label === ignoreLabel) {
          that.onToggleIgnore({ currentTarget: { dataset: { id: id } } });
        } else if (label === '🔕 长期忽略…') {
          that.onLongIgnore(id);
        } else if (label === '🗑 删除记录') {
          that.onSwipeDelete({ currentTarget: { dataset: { id: id } } });
        }
      }
    });
  },

  onQuickPick: function (e) {
    var id = e.currentTarget.dataset.id;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg) return;
    var that = this;
    // 用药记录不走通用完成：打卡服药去仿真药板
    if (pkg.type === 'medication' && pkg.status === 'pending') {
      wx.navigateTo({ url: '/pages/medboard/medboard?id=' + id });
      return;
    }
    if (pkg.status === 'pending') {
      var patch = { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me };
      that.optimisticUpdate(id, patch);
      api.updatePackage(id, patch, null, function () {
        that.optimisticRollback(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      that.computeList();
      wx.showToast({ title: '已完成', icon: 'success' });
    } else {
      that.optimisticUpdate(id, { status: 'pending', pickedAt: '', pickedBy: '' });
      api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, null, function () {
        that.optimisticRollback(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      that.computeList();
    }
  },
  onEdit: function (e) { wx.navigateTo({ url: '/pages/add/add?id=' + e.currentTarget.dataset.id }); },
  onCopy: function (e) {
    wx.setClipboardData({ data: e.currentTarget.dataset.code, success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
  },
  onAdd: function () { wx.navigateTo({ url: '/pages/add/add' }); },
  onShareAppMessage: function () {
    return {
      title: '屋事小记 - 家庭快递取件码共享',
      path: '/pages/list/list'
    };
  },
  onShareTimeline: function () {
    return { title: '屋事小记 - 家庭快递取件码共享' };
  }
});
