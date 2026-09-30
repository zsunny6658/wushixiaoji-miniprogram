// pages/detail/detail.js - 详情页
var api = require('../../utils/api');
var helpers = require('../../utils/helpers');
var app = getApp();

Page({
  data: {
    pkg: null
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    if (!opts || !opts.id) {
      wx.showToast({ title: '记录不存在', icon: 'none' });
      setTimeout(function () { wx.navigateBack(); }, 1000);
      return;
    }
    this.loadDetail(opts.id);
  },

  onShow: function () {
    // 从编辑页返回时刷新
    if (this.data.pkg) {
      this.loadDetail(this.data.pkg.id);
    }
  },

  loadDetail: function (id) {
    var that = this;
    var gd = app.globalData;
    var pkgs = (gd.packages || []);
    var raw = pkgs.find(function (p) { return p.id === id; });
    if (raw) {
      this.applyDetail(raw);
      return;
    }
    // 缓存里没有，先刷新本地状态重试
    app.refreshState(function () {
      raw = (app.globalData.packages || []).find(function (p) { return p.id === id; });
      if (raw) {
        that.applyDetail(raw);
        return;
      }
      // 本地还是没有，走 API 直接查
      api.getPackage(id, function (data) {
        if (data && data.package) {
          that.applyDetail(data.package);
        } else {
          wx.showToast({ title: '记录不存在', icon: 'none' });
          setTimeout(function () { wx.navigateBack(); }, 1000);
        }
      }, function () {
        wx.showToast({ title: '记录不存在', icon: 'none' });
        setTimeout(function () { wx.navigateBack(); }, 1000);
      });
    });
  },

  applyDetail: function (raw) {
    var gd = app.globalData;
    var decorated = helpers.decorate(raw, gd.members);
    this.setData({ pkg: decorated });
    var titleMap = { pickup: '取件详情', todo: '备忘详情', debt: '待还详情', medication: '用药详情' };
    wx.setNavigationBarTitle({ title: titleMap[decorated.type] || '详情' });
  },

  onCopy: function () {
    var code = this.data.pkg.code || '';
    if (!code) { wx.showToast({ title: '没有可复制的内容', icon: 'none' }); return; }
    wx.setClipboardData({
      data: code,
      success: function () { wx.showToast({ title: '已复制', icon: 'success' }); }
    });
  },

  // 「更多」收纳低频操作：复制 / 归档 / 删除
  onMoreActions: function () {
    var that = this;
    var isArchived = this.data.pkg.status === 'archived';
    // 忽略/恢复也收进更多菜单（低频操作，底栏只留主次两组）
    var ignoreLabel = this.data.pkg.status === 'ignored' ? '恢复提醒' : '忽略';
    var items = ['复制'];
    if (!isArchived) items = items.concat([ignoreLabel, '归档', '删除']);
    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        var label = items[res.tapIndex];
        if (label === '复制') that.onCopy();
        else if (label === ignoreLabel) that.onToggleIgnore();
        else if (label === '归档') that.onArchive();
        else if (label === '删除') that.onDelete();
      }
    });
  },

  onEdit: function () {
    var id = this.data.pkg.id;
    wx.navigateTo({ url: '/pages/add/add?id=' + id });
  },

  onOpenMedboard: function () {
    wx.navigateTo({ url: '/pages/medboard/medboard?id=' + this.data.pkg.id });
  },

  onDelete: function () {
    var self = this;
    var id = this.data.pkg.id;
    wx.showModal({
      title: '确认删除',
      content: '确认删除这条记录？此操作不可恢复',
      confirmColor: '#ef4444',
      success: function (res) {
        if (res.confirm) {
          api.deletePackage(id, function () {
            app.refreshState(function () {
              wx.showToast({ title: '已删除', icon: 'success' });
              setTimeout(function () { wx.navigateBack(); }, 800);
            });
          }, function () {
            wx.showToast({ title: '删除失败', icon: 'none' });
          });
        }
      }
    });
  },

  onPullDownRefresh: function () {
    var self = this;
    app.refreshState(function () {
      if (self.data.pkg) self.loadDetail(self.data.pkg.id);
      wx.stopPullDownRefresh();
    }, { force: true });
  },

  // 乐观更新：立即更新本地 UI
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
    var updated = pkgs.filter(function (p) { return p.id === id; })[0];
    if (updated) this.applyDetail(updated);
  },

  onToggleIgnore: function () {
    var self = this;
    var pkg = this.data.pkg;
    var id = pkg.id;
    if (pkg.status === 'ignored') {
      api.restorePackage(id, function () {
        self.optimisticUpdate(id, { status: 'pending', ignoreAt: '', ignoreRuleId: '' });
        wx.showToast({ title: '已恢复', icon: 'success' });
      }, function () {
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
    } else {
      wx.showActionSheet({
        itemList: ['普通忽略（仅本次）', '智能忽略（自动忽略相似待办）'],
        success: function (res) {
          if (res.tapIndex === 0) {
            var days = app.globalData.ignoreCleanupDays || 7;
            self.optimisticUpdate(id, { status: 'ignored' });
            api.updatePackage(id, { status: 'ignored' }, null, function () {
              self.loadDetail(id);
              wx.showToast({ title: '操作失败', icon: 'none' });
            });
            wx.showToast({ title: '已忽略，' + days + '天后自动删除', icon: 'none' });
          } else {
            wx.showModal({
              title: '智能忽略',
              content: '将创建规则自动忽略相似的待办，默认30天有效。确认？',
              success: function (r) {
                if (r.confirm) {
                  api.ignoreWithRule(id, { durationDays: 30, threshold: 0.6 }, function () {
                    self.optimisticUpdate(id, { status: 'ignored' });
                    wx.showToast({ title: '已忽略并创建规则', icon: 'success' });
                  }, function () {
                    wx.showToast({ title: '操作失败', icon: 'none' });
                  });
                }
              }
            });
          }
        }
      });
    }
  },

  onArchive: function () {
    var self = this;
    var id = this.data.pkg.id;
    wx.showModal({
      title: '确认归档',
      content: '归档后待办将移到归档区，可随时恢复。确认？',
      success: function (res) {
        if (res.confirm) {
          api.archivePackage(id, function () {
            self.optimisticUpdate(id, { status: 'archived' });
            wx.showToast({ title: '已归档', icon: 'success' });
            setTimeout(function () { wx.navigateBack(); }, 800);
          }, function () {
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
  },

  onToggleFlag: function () {
    var self = this;
    var pkg = this.data.pkg;
    var id = pkg.id;
    if (pkg.importance === 'high') {
      this.optimisticUpdate(id, { importance: 'medium' });
      api.updatePackage(id, { importance: 'medium' }, null, function () {
        self.loadDetail(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      wx.showToast({ title: '已取消重点', icon: 'success' });
    } else {
      this.optimisticUpdate(id, { importance: 'high' });
      api.updatePackage(id, { importance: 'high' }, null, function () {
        self.loadDetail(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      wx.showToast({ title: '已标记重点', icon: 'success' });
    }
  },

  onTogglePick: function () {
    var self = this;
    var pkg = this.data.pkg;
    var id = pkg.id;
    if (pkg.status === 'picked') {
      this.optimisticUpdate(id, { status: 'pending', pickedAt: '', pickedBy: '' });
      api.updatePackage(id, { status: 'pending', pickedAt: '', pickedBy: '' }, null, function () {
        self.loadDetail(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      wx.showToast({ title: '已撤销', icon: 'success' });
    } else {
      var patch = { status: 'picked', pickedAt: new Date().toISOString(), pickedBy: app.globalData.me };
      this.optimisticUpdate(id, patch);
      api.updatePackage(id, patch, null, function () {
        self.loadDetail(id);
        wx.showToast({ title: '操作失败', icon: 'none' });
      });
      wx.showToast({ title: '已完成', icon: 'success' });
    }
  },
  onShareAppMessage: function () {
    return { title: '屋事小记 - 家庭快递取件码共享', path: '/pages/overview/overview' };
  },
  onShareTimeline: function () {
    return { title: '屋事小记 - 家庭快递取件码共享' };
  }
});
