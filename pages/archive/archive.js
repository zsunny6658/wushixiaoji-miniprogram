// pages/archive/archive.js - 归档记录列表
var api = require('../../utils/api');
var app = getApp();

var TYPE_META = {
  pickup: { icon: '📦', label: '取件' },
  todo: { icon: '📝', label: '备忘' },
  debt: { icon: '💳', label: '还款' }
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
        }
        return {
          id: p.id,
          icon: meta.icon,
          typeLabel: meta.label,
          title: p.title || p.code || '(无标题)',
          sub: sub,
          archivedAtText: fmtTime(p.updatedAt),
          fromPicked: p.archiveFrom === 'picked'
        };
      });
      that.setData({ items: items, loading: false });
      if (done) done();
    }, function () {
      that.setData({ loading: false });
      if (done) done();
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
  }
});
