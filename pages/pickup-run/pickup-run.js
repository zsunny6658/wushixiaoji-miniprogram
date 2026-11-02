// pages/pickup-run/pickup-run.js - 按序取件：按驿站聚合待取件，按取件码货架顺序排列，逐个核销
var api = require('../../utils/api');
var app = getApp();

// 解析取件码中的数字段："6-1-1996" -> [6,1,1996]
function parseCode(code) {
  var s = String(code || '').trim();
  var nums = (s.match(/\d+/g) || []).map(Number);
  return { nums: nums, str: s.toLowerCase(), hasNums: nums.length > 0 };
}

// 货架顺序比较：数字段逐级比较（架->层->号），段数少者在前；无数字码排最后按字符串排
function compareCodes(a, b) {
  var pa = a._pk, pb = b._pk;
  if (pa.hasNums && pb.hasNums) {
    var n = Math.min(pa.nums.length, pb.nums.length);
    for (var i = 0; i < n; i++) {
      if (pa.nums[i] !== pb.nums[i]) return pa.nums[i] - pb.nums[i];
    }
    if (pa.nums.length !== pb.nums.length) return pa.nums.length - pb.nums.length;
  } else if (pa.hasNums !== pb.hasNums) {
    return pa.hasNums ? -1 : 1;
  }
  return pa.str < pb.str ? -1 : (pa.str > pb.str ? 1 : 0);
}

Page({
  data: {
    // 选站态
    stations: [],        // [{name, count}]
    stationName: '',     // 已选驿站；'' = 选站列表
    // 执行态
    groups: [],          // [{key, items:[{id, seq, code, sub, owner, done}]}]
    total: 0,
    doneCount: 0,
    finished: false,
    batchMode: false,
    batchCount: 0,
    allSelected: false
  },

  onLoad: function () {
    api.setToken(app.globalData.token);
    // 本次会话已取核销记录（id -> true），已取件划线保留在列表里供反悔
    this._doneIds = {};
  },

  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    var that = this;
    app.refreshState(function () { that.build(); });
  },
  onPullDownRefresh: function () {
    var that = this;
    app.refreshState(function () { that.build(); wx.stopPullDownRefresh(); });
  },

  // 聚合：待取件按驿站分组；已选站则渲染顺序视图
  build: function () {
    var gd = app.globalData;
    var meId = gd.meId, isAdmin = gd.isAdmin;
    var doneIds = this._doneIds || {};
    var pkgs = (gd.packages || []).filter(function (p) {
      if (p.type !== 'pickup') return false;
      // 本次已取的也保留（划线展示）；未取的须为 pending
      if (doneIds[p.id]) return true;
      if (p.status !== 'pending') return false;
      if (p.isPrivate && p.ownerId && p.ownerId !== meId && !isAdmin) return false;
      return true;
    });

    // 驿站聚合
    var map = {}, order = [];
    pkgs.forEach(function (p) {
      var s = String(p.station || '').trim() || '未填写驿站';
      if (!map[s]) { map[s] = 0; order.push(s); }
      map[s]++;
    });
    var stations = order.map(function (s) { return { name: s, count: map[s] }; });
    stations.sort(function (a, b) { return b.count - a.count; });

    var cur = this.data.stationName;
    if (cur) {
      // 已选驿站被清空（全部取完且刷新后）则退回选站
      if (map[cur] === undefined && !pkgs.some(function (p) { return (String(p.station || '').trim() || '未填写驿站') === cur; })) {
        this.setData({ stationName: '' });
        cur = '';
      }
    }
    this.setData({ stations: stations });
    if (cur) this.buildRun(cur);
  },

  // 顺序视图：货架分组 + 取件码排序 + 序号
  buildRun: function (stationName) {
    var gd = app.globalData;
    var doneIds = this._doneIds || {};
    var items = (gd.packages || []).filter(function (p) {
      if (p.type !== 'pickup') return false;
      var s = String(p.station || '').trim() || '未填写驿站';
      if (s !== stationName) return false;
      if (doneIds[p.id]) return true;
      if (p.status !== 'pending') return false;
      if (p.isPrivate && p.ownerId && p.ownerId !== gd.meId && !gd.isAdmin) return false;
      return true;
    }).map(function (p) {
      return {
        id: p.id,
        code: p.code || '(无取件码)',
        company: p.company || '',
        owner: p.owner || '',
        _pk: parseCode(p.code)
      };
    });
    items.sort(compareCodes);

    // 分组：取件码含 ≥2 个数字段时按首段（货架号）分组，否则单列表
    var multi = items.length && items.every(function (it) { return it._pk.nums.length >= 2; });
    var groups = [];
    if (multi) {
      var gm = {}, go = [];
      items.forEach(function (it) {
        var k = '货架 ' + it._pk.nums[0];
        if (!gm[k]) { gm[k] = []; go.push(k); }
        gm[k].push(it);
      });
      go.forEach(function (k) { groups.push({ key: k, items: gm[k] }); });
    } else if (items.length) {
      groups.push({ key: '按取件码顺序', items: items });
    }

    // 全局序号 + 已取标记
    var seq = 0, doneCount = 0;
    groups.forEach(function (g) {
      g.items.forEach(function (it) {
        it.seq = ++seq;
        it.done = !!doneIds[it.id];
        if (it.done) doneCount++;
        var subs = [];
        if (it.company) subs.push(it.company);
        if (it.owner) subs.push('@' + it.owner);
        it.sub = subs.join(' · ');
      });
    });

    this.setData({
      stationName: stationName,
      groups: groups,
      total: seq,
      doneCount: doneCount,
      finished: seq > 0 && doneCount === seq
    });
  },

  // —— 批量 / 全量核销（v0.23.16）——

  onToggleBatch: function () {
    var entering = !this.data.batchMode;
    if (entering) {
      var groups = (this.data.groups || []).map(function (g) {
        return Object.assign({}, g, { items: g.items.map(function (it) { return Object.assign({}, it, { batchSelected: false }); }) });
      });
      this.setData({ batchMode: true, groups: groups, batchCount: 0 });
    } else {
      this.setData({ batchMode: false, batchCount: 0 });
      this.buildRun(this.data.stationName);
    }
  },

  // 批量模式下点行 = 选中/取消；非批量 = 复制取件码
  onRowTap: function (e) {
    if (!this.data.batchMode) {
      this.onCopyCode(e);
      return;
    }
    var id = e.currentTarget.dataset.id;
    var count = 0;
    var groups = (this.data.groups || []).map(function (g) {
      return Object.assign({}, g, { items: g.items.map(function (it) {
        var c = Object.assign({}, it);
        if (c.id === id && !c.done) c.batchSelected = !c.batchSelected;
        if (c.batchSelected) count++;
        return c;
      }) });
    });
    this.setData({ groups: groups, batchCount: count, allSelected: this._allSelected() });
  },

  onSelectAllRun: function () {
    var allSelected = this._allSelected();
    var newVal = !allSelected;
    var count = 0;
    var groups = (this.data.groups || []).map(function (g) {
      return Object.assign({}, g, { items: g.items.map(function (it) {
        var c = Object.assign({}, it);
        if (!c.done) c.batchSelected = newVal;
        if (c.batchSelected) count++;
        return c;
      }) });
    });
    this.setData({ groups: groups, batchCount: count, allSelected: newVal });
  },

  _allSelected: function () {
    var items = [];
    (this.data.groups || []).forEach(function (g) { items = items.concat(g.items); });
    var pickable = items.filter(function (it) { return !it.done; });
    return pickable.length > 0 && pickable.every(function (it) { return it.batchSelected; });
  },

  _pickIds: function (ids) {
    var doneIds = this._doneIds;
    var now = new Date().toISOString();
    var me = app.globalData.me;
    var that = this;
    ids.forEach(function (id) {
      var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
      if (!pkg || pkg.status !== 'pending') return;
      doneIds[id] = true;
      var patch = { status: 'picked', pickedAt: now, pickedBy: me };
      that.patchLocal(id, patch);
      api.updatePackage(id, patch, null, function () {
        delete doneIds[id];
        that.patchLocal(id, { status: 'pending', pickedAt: '', pickedBy: '' });
        wx.showToast({ title: '操作失败', icon: 'none' });
        that.build();
      });
    });
  },

  onBatchPickRun: function () {
    var ids = [];
    (this.data.groups || []).forEach(function (g) {
      g.items.forEach(function (it) { if (it.batchSelected && !it.done) ids.push(it.id); });
    });
    if (!ids.length) { wx.showToast({ title: '先勾选要取的件', icon: 'none' }); return; }
    var that = this;
    wx.showModal({
      title: '批量已取',
      content: '将选中的 ' + ids.length + ' 件标记为已取？',
      success: function (res) {
        if (!res.confirm) return;
        that._pickIds(ids);
        that.setData({ batchMode: false, batchCount: 0 });
        that.buildRun(that.data.stationName);
        var left = that.data.total - that.data.doneCount;
        wx.showToast({ title: left > 0 ? '已取 ' + ids.length + ' 件，还剩 ' + left + ' 件' : '本站全部取完 🎉', icon: left > 0 ? 'none' : 'success' });
      }
    });
  },

  onPickAll: function () {
    var ids = [];
    (this.data.groups || []).forEach(function (g) {
      g.items.forEach(function (it) { if (!it.done) ids.push(it.id); });
    });
    if (!ids.length) { wx.showToast({ title: '没有待取件', icon: 'none' }); return; }
    var that = this;
    wx.showModal({
      title: '全部已取',
      content: '将本站剩余 ' + ids.length + ' 件全部标记为已取？',
      success: function (res) {
        if (!res.confirm) return;
        that._pickIds(ids);
        that.buildRun(that.data.stationName);
        wx.showToast({ title: '本站全部取完 🎉', icon: 'success' });
      }
    });
  },

  onSelectStation: function (e) {
    this.buildRun(e.currentTarget.dataset.name);
  },
  onSwitchStation: function () {
    this.setData({ stationName: '', groups: [], total: 0, doneCount: 0, finished: false });
  },

  // 核销一件（乐观更新，失败回滚）
  onPick: function (e) {
    var id = e.currentTarget.dataset.id;
    var pkg = (app.globalData.packages || []).find(function (p) { return p.id === id; });
    if (!pkg || pkg.status !== 'pending') return;
    this._doneIds[id] = true;
    var patch = { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me };
    this.patchLocal(id, patch);
    var that = this;
    api.updatePackage(id, patch, null, function () {
      delete that._doneIds[id];
      that.patchLocal(id, { status: 'pending', pickedAt: '', pickedBy: '' });
      wx.showToast({ title: '操作失败', icon: 'none' });
      that.build();
    });
    this.buildRun(this.data.stationName);
    var left = this.data.total - this.data.doneCount;
    wx.showToast({
      title: left > 0 ? '已取 1 件，还剩 ' + left + ' 件' : '本站全部取完 🎉',
      icon: left > 0 ? 'none' : 'success'
    });
  },

  // 撤销本次核销
  onUndo: function (e) {
    var id = e.currentTarget.dataset.id;
    delete this._doneIds[id];
    this.patchLocal(id, { status: 'pending', pickedAt: '', pickedBy: '' });
    var that = this;
    api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, null, function () {
      wx.showToast({ title: '操作失败', icon: 'none' });
    });
    this.buildRun(this.data.stationName);
  },

  patchLocal: function (id, patch) {
    var pkgs = app.globalData.packages || [];
    for (var i = 0; i < pkgs.length; i++) {
      if (pkgs[i].id === id) {
        for (var k in patch) pkgs[i][k] = patch[k];
        break;
      }
    }
  },

  // 点击取件码复制
  onCopyCode: function (e) {
    var code = e.currentTarget.dataset.code;
    if (!code || code === '(无取件码)') return;
    wx.setClipboardData({ data: code, success: function () { wx.showToast({ title: '取件码已复制', icon: 'success' }); } });
  },

  onBackToList: function () { wx.navigateBack(); },

  onShareAppMessage: function () {
    return { title: '屋事小记 - 家庭快递取件码共享', path: '/pages/overview/overview' };
  }
});
