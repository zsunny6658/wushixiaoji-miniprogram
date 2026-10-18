// pages/archive/archive.js - 归档记录列表
var api = require('../../utils/api');
var app = getApp();

var TYPE_META = {
  pickup: { icon: '📦', label: '取件' },
  todo: { icon: '📝', label: '备忘' },
  debt: { icon: '💳', label: '还款' },
  medication: { icon: '💊', label: '用药' }
};

function fmtTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

Page({
  data: {
    items: [],
    shown: [],
    search: '',
    loading: true
  },

  onLoad: function () {
    api.setToken(app.globalData.token);
    this.loadList();
  },

  onShow: function () {
    // 从详情页返回时刷新（归档状态可能已变化）
    if (!this.data.loading) this.loadList();
  },

  onPullDownRefresh: function () {
    this.loadList(function () { wx.stopPullDownRefresh(); });
  },

  loadList: function (done) {
    var that = this;
    api.getArchivedPackages(function (data) {
      var pkgs = (data && data.packages) || [];
      var items = pkgs.map(function (p) {
        var meta = TYPE_META[p.type] || TYPE_META.pickup;
        var sub = '';
        if (p.type === 'pickup') sub = p.station || '';
        else if (p.type === 'debt') {
          sub = (p.institution ? p.institution + ' · ' : '') + (p.amount ? '¥' + p.amount : '');
        } else if (p.type === 'medication') {
          var pi = p.pillInfo || {};
          if (pi.boards) sub = pi.boards + '版装 · 当前第' + (pi.boardNo || 1) + '版';
        }
        var isMed = p.type === 'medication' && !!(p.pillInfo && p.pillInfo.boards);
        var fromLabel = p.archiveFrom === 'picked' ? '已完成归档' : (p.archiveFrom === 'ignored' ? '已忽略归档' : '');
        return {
          id: p.id,
          icon: meta.icon,
          typeLabel: meta.label,
          title: p.title || p.code || '(无标题)',
          sub: sub,
          archivedAtText: fmtTime(p.updatedAt),
          fromLabel: fromLabel,
          isMed: isMed
        };
      });
      that.setData({ items: items, loading: false });
      that.applyFilter();
      if (done) done();
    }, function () {
      that.setData({ loading: false });
      if (done) done();
    });
  },

  // —— 搜索：标题/驿站/类型本地过滤（数据量小，直接过滤即可）——
  onSearchInput: function (e) {
    this.setData({ search: e.detail.value });
    this.applyFilter();
  },
  onClearSearch: function () {
    this.setData({ search: '' });
    this.applyFilter();
  },
  applyFilter: function () {
    var q = (this.data.search || '').trim().toLowerCase();
    var items = this.data.items || [];
    var shown = !q ? items : items.filter(function (it) {
      return (it.title || '').toLowerCase().indexOf(q) >= 0 ||
             (it.sub || '').toLowerCase().indexOf(q) >= 0 ||
             (it.typeLabel || '').indexOf(q) >= 0;
    });
    this.setData({ shown: shown });
  },

  // —— 批量清理：按归档时间批量删除（仅家庭管理员可用，服务端校验）——
  onCleanupTap: function () {
    var that = this;
    var ranges = ['30 天前', '90 天前', '180 天前', '365 天前'];
    var days = [30, 90, 180, 365];
    wx.showActionSheet({
      itemList: ranges.map(function (r) { return '清理 ' + r + ' 的归档'; }),
      success: function (res) {
        var d = days[res.tapIndex];
        if (!d) return;
        wx.showModal({
          title: '确认清理',
          content: '将永久删除归档超过 ' + d + ' 的记录，删除后不可恢复。确定继续？',
          confirmText: '删除',
          confirmColor: '#EF4444',
          success: function (m) {
            if (!m.confirm) return;
            wx.showLoading({ title: '清理中…' });
            api.request('POST', '/api/packages/archived/cleanup', { olderThanDays: d }, function (data) {
              wx.hideLoading();
              wx.showToast({ title: '已清理 ' + ((data && data.removed) || 0) + ' 条', icon: 'none' });
              that.loadList();
            }, function () {
              wx.hideLoading();
              wx.showToast({ title: '清理失败（需家庭管理员）', icon: 'none' });
            });
          }
        });
      }
    });
  },

  onUnarchive: function (e) {
    var id = e.currentTarget.dataset.id;
    var that = this;
    api.unarchivePackage(id, function () {
      wx.showToast({ title: '已取消归档', icon: 'success' });
      that.loadList();
    });
  },

  onViewDetail: function (e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  // 用药归档记录：直达仿真药板
  onOpenMedboard: function (e) {
    wx.navigateTo({ url: '/pages/medboard/medboard?id=' + e.currentTarget.dataset.id });
  }
});
