// pages/detail/detail.js - 详情页
var api = require('../../utils/api');
var helpers = require('../../utils/helpers');
var app = getApp();

Page({
  data: {
    pkg: null,
    imageUrls: []
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    // 分享链接落地：未登录时先去登录（登录后默认进首页，可重新点开）
    if (!app.globalData.token) {
      wx.showToast({ title: '请先登录后查看', icon: 'none' });
      setTimeout(function () { wx.reLaunch({ url: '/pages/login/login' }); }, 800);
      return;
    }
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
    var that = this;
    var gd = app.globalData;
    // 浅拷贝：decorate 有缓存，ageText 是随时间变化的渲染值，不能写回缓存对象
    var decorated = Object.assign({}, helpers.decorate(raw, gd.members));
    // 取件存放时效：待取件时展示已存放多久（从本次 raw 计算，避免 decorate 缓存导致时效停滞）
    decorated.ageText = '';
    if (raw.type === 'pickup' && raw.status === 'pending' && raw.arrivedAt) {
      var arr = new Date(raw.arrivedAt);
      if (!isNaN(arr)) {
        var hrs = Math.floor((Date.now() - arr.getTime()) / 3600000);
        if (hrs < 1) decorated.ageText = '刚到驿站';
        else if (hrs < 24) decorated.ageText = '已存放 ' + hrs + ' 小时';
        else decorated.ageText = '已存放 ' + Math.floor(hrs / 24) + ' 天' + (hrs % 24 ? ' ' + (hrs % 24) + ' 小时' : '');
      }
    }
    this.setData({ pkg: decorated });
    // 附件图墙（v0.17.0）：为图片 id 签发带过期的预览 URL（<image> 标签无法带 header）
    if (Array.isArray(raw.images) && raw.images.length) {
      api.signFileUrls(raw.images, function (d) {
        var urls = raw.images
          .map(function (id) { return (d.urls && d.urls[id]) ? api.absUrl(d.urls[id]) : ''; })
          .filter(function (u) { return !!u; });
        that.setData({ imageUrls: urls });
      }, function () { /* 签发失败静默：不影响详情展示 */ });
    } else if (this.data.imageUrls.length) {
      this.setData({ imageUrls: [] });
    }
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

  // 附件预览：点击缩略图全屏查看
  onPreviewImage: function (e) {
    var idx = e.currentTarget.dataset.idx || 0;
    var urls = this.data.imageUrls || [];
    if (!urls.length) return;
    wx.previewImage({ current: urls[idx], urls: urls });
  },

  // 「更多」收纳低频操作：编辑 / 复制 / 归档 / 删除（忽略为高频操作，提到底栏）
  onMoreActions: function () {
    var that = this;
    var isArchived = this.data.pkg.status === 'archived';
    var items = ['编辑', '复制'];
    if (this.data.pkg.type === 'medication') items.push('初始化药板');
    if (!isArchived) items = items.concat(['归档', '删除']);
    wx.showActionSheet({
      itemList: items,
      success: function (res) {
        var label = items[res.tapIndex];
        if (label === '编辑') that.onEdit();
        else if (label === '复制') that.onCopy();
        else if (label === '初始化药板') that.onOpenMedboard();
        else if (label === '归档') that.onArchive();
        else if (label === '删除') that.onDelete();
      }
    });
  },

  onEdit: function () {
    var id = this.data.pkg.id;
    wx.navigateTo({ url: '/pages/add/add?id=' + id });
  },

  onOpenMedboard: function (autoInit) {
    var url = '/pages/medboard/medboard?id=' + this.data.pkg.id + (autoInit === true ? '&init=1' : '');
    wx.navigateTo({ url: url });
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

  // 忽略：高频操作，一步弹出忽略方式并直接执行（不再二次确认）
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
      return;
    }
    var options = [
      { label: '仅忽略本次', days: -1 },
      { label: '长期忽略 · 相似待办 30 天不再提醒', days: 30 },
      { label: '长期忽略 · 相似待办 90 天不再提醒', days: 90 },
      { label: '永久忽略 · 相似待办不再提醒', days: 0 }
    ];
    wx.showActionSheet({
      alertText: '选择忽略方式',
      itemList: options.map(function (o) { return o.label; }),
      success: function (res) {
        var opt = options[res.tapIndex];
        if (!opt) return;
        if (opt.days < 0) {
          // 仅忽略本次：进入忽略态，按清理模式到期删除或转归档
          var days = app.globalData.ignoreCleanupDays || 7;
          var toArch = app.globalData.ignoreCleanupMode === 'archive';
          self.optimisticUpdate(id, { status: 'ignored' });
          api.updatePackage(id, { status: 'ignored' }, null, function () {
            self.loadDetail(id);
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
          wx.showToast({ title: '已忽略，' + days + '天后' + (toArch ? '转入归档' : '自动删除'), icon: 'none' });
        } else {
          // 长期/永久忽略：创建规则，相似待办自动忽略
          self.optimisticUpdate(id, { status: 'ignored' });
          api.ignoreWithRule(id, { durationDays: opt.days, threshold: 0.6 }, function () {
            self.loadDetail(id);
            wx.showToast({ title: opt.days === 0 ? '已永久忽略相似待办' : '已忽略并创建' + opt.days + '天规则', icon: 'success' });
          }, function () {
            self.optimisticUpdate(id, { status: 'pending', ignoreAt: '', ignoreRuleId: '' });
            wx.showToast({ title: '操作失败', icon: 'none' });
          });
        }
      }
    });
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
    // 用药记录不走通用完成：打卡服药去仿真药板
    if (pkg.type === 'medication' && pkg.status !== 'picked') {
      wx.navigateTo({ url: '/pages/medboard/medboard?id=' + id });
      return;
    }
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
  // 单条分享：取件分享带驿站+取件码，其他类型带标题；落地直达本条详情
  onShareAppMessage: function () {
    var p = this.data.pkg;
    if (p && p.id) {
      var label = p.type === 'pickup'
        ? '「' + (p.station || '快递') + '」取件码 ' + (p.code || '')
        : '「' + (p.title || p.code || '') + '」待办提醒';
      return { title: label, path: '/pages/detail/detail?id=' + p.id };
    }
    return { title: '屋事小记 - 家庭快递取件码共享', path: '/pages/overview/overview' };
  },
  onShareTimeline: function () {
    return { title: '屋事小记 - 家庭快递取件码共享' };
  }
});
