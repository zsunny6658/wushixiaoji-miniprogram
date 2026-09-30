// pages/me/me.js
var api = require('../../utils/api');
var subscribe = require('../../utils/subscribe');
var app = getApp();

Page({
  data: {
    meName: '',
    meFirstChar: '?',
    meAvatar: '',
    meEmail: '',
    roleLabel: '成员',
    familyName: '',
    isAdmin: false,
    familyId: '',
    families: [],
    minLevel: 'important',
    baseUrl: 'https://parcel.zsunny.top',
    viewOptions: ['📋 列表', '🎯 四象限'],
    viewIndex: 0,
    groupOptions: ['不分组', '按成员', '按待办类型'],
    groupIndex: 2,
    showCreateFamily: false,
    newFamilyName: '',
    // 通知设置
    notifyEnabled: true,
    notifyDays: 3,
    notifyCleanupDays: 7,
    showNotifyModal: false,
    mpNotifyConfigured: false,
    mailConfigured: false,
    notifyTemplateId: '',
    pickupHour8: true,
    pickupHour20: true,
    debtHour8: true,
    debtHour20: true,
    summaryHour: 8,
    subscribeAuthorized: false,
    // 关于
    showAboutModal: false
  },

  onLoad: function () {
    api.setToken(app.globalData.token);
  },
  onShow: function () {
    if (!app.globalData.token) { wx.reLaunch({ url: '/pages/login/login' }); return; }
    if (this.getTabBar) this.getTabBar().setData({ active: 3 });
    this.refresh();
  },

  refresh: function () {
    var gd = app.globalData;
    var me = gd.me || '';
    var role = gd.role || 'member';
    var roleMap = { admin: '管理员', owner: '超级管理员', family_admin: '家庭管理员', member: '成员' };
    this.setData({
      meName: me || '未登录',
      meFirstChar: me ? me.charAt(0) : '?',
      meAvatar: gd.meAvatar || '',
      meEmail: gd.meEmail || '',
      roleLabel: roleMap[role] || role,
      isAdmin: !!gd.isAdmin,
      familyId: gd.familyId || '',
      familyName: this.findFamilyName(gd.familyId),
      families: gd.families || [],
      baseUrl: gd.baseUrl || 'https://parcel.zsunny.top',
      viewIndex: (gd.viewMode === 'quadrant') ? 1 : 0,
      groupIndex: ['none', 'owner', 'type'].indexOf(gd.group || 'type'),
      showCreateFamily: false,
      notifyDays: parseInt(wx.getStorageSync('parcel.reminderDays') || '3', 10) || 3,
      notifyCleanupDays: parseInt(wx.getStorageSync('parcel.ignoreCleanupDays') || '7', 10) || 7
    });
  },

  onShowCreateFamily: function () {
    this.setData({ showCreateFamily: true });
  },
  onCancelCreateFamily: function () {
    this.setData({ showCreateFamily: false, newFamilyName: '' });
  },
  onNewFamilyName: function (e) {
    this.setData({ newFamilyName: e.detail.value });
  },
  onCreateFamily: function () {
    var name = (this.data.newFamilyName || '').trim();
    if (!name) { wx.showToast({ title: '请输入家庭名称', icon: 'none' }); return; }
    api.request('POST', '/api/families', { name: name }, function (data) {
      var that = this;
      if (data && data.family) {
        app.globalData.familyId = data.family.id;
        wx.setStorageSync('parcel.familyId', data.family.id);
        that.setData({ showCreateFamily: false, newFamilyName: '' });
        app.refreshState();
        wx.showToast({ title: '已创建：' + name, icon: 'success' });
      }
    }.bind(this), function (err) {
      wx.showToast({ title: '创建失败', icon: 'none' });
    });
  },

  findFamilyName: function (fid) {
    var fams = app.globalData.families || [];
    for (var i = 0; i < fams.length; i++) { if (fams[i].id === fid) return fams[i].name || '未命名家庭'; }
    return '未指定';
  },

  onViewChange: function (e) {
    var i = parseInt(e.detail.value, 10);
    var v = ['list', 'quadrant'][i];
    app.globalData.viewMode = v;
    this.setData({ viewIndex: i });
  },
  onGroupChange: function (e) {
    var i = parseInt(e.detail.value, 10);
    var v = ['none', 'owner', 'type'][i];
    app.globalData.group = v;
    this.setData({ groupIndex: i });
  },

  // 通知设置弹窗 - 立即打开，异步加载配置
  onOpenNotifyModal: function () {
    var that = this;
    // 立即打开弹窗（用当前缓存值）
    that.setData({ showNotifyModal: true });
    // 异步从服务端读取最新配置
    api.request('GET', '/api/notify/config', null, function (data) {
      if (data && data.notify) {
        var n = data.notify;
        var ph = n.pickupHours || [8, 20];
        var dh = n.debtHours || [8, 20];
        that.setData({
          notifyEnabled: n.enabled !== false,
          notifyDays: n.daysBefore || 3,
          minLevel: n.minLevel || 'important',
          pickupHour8: ph.indexOf(8) >= 0,
          pickupHour20: ph.indexOf(20) >= 0,
          debtHour8: dh.indexOf(8) >= 0,
          debtHour20: dh.indexOf(20) >= 0,
          summaryHour: n.summaryHour !== undefined ? n.summaryHour : 8
        });
      }
    });
    // 读取家庭配置判断通知方式
    api.request('GET', '/api/config' + (that.data.familyId ? '?familyId=' + that.data.familyId : ''), null, function (data) {
      var c = (data && data.config) || {};
      that.setData({
        mailConfigured: !!(c.smtp && c.smtp.host),
        mpNotifyConfigured: !!(c.notify && c.notify.templateId),
        notifyTemplateId: (c.notify && c.notify.templateId) || ''
      });
    });
  },
  noop: function () {},
  onCloseNotifyModal: function () {
    this.setData({ showNotifyModal: false });
  },
  onNotifyToggle: function (e) {
    this.setData({ notifyEnabled: e.detail.value });
  },
  onNotifyDaysBlur: function (e) {
    var days = Math.max(1, parseInt(e.detail.value, 10) || 3);
    this.setData({ notifyDays: days });
  },
  onMinLevelTap: function (e) {
    this.setData({ minLevel: e.currentTarget.dataset.level });
  },
  onNotifyCleanupBlur: function (e) {
    var days = Math.max(1, parseInt(e.detail.value, 10) || 7);
    this.setData({ notifyCleanupDays: days });
  },
  onNotifyTemplateInput: function (e) {
    this.setData({ notifyTemplateId: e.detail.value.trim() });
  },
  onTogglePickupHour: function (e) {
    var h = parseInt(e.currentTarget.dataset.hour, 10);
    if (h === 8) this.setData({ pickupHour8: !this.data.pickupHour8 });
    if (h === 20) this.setData({ pickupHour20: !this.data.pickupHour20 });
  },
  onToggleDebtHour: function (e) {
    var h = parseInt(e.currentTarget.dataset.hour, 10);
    if (h === 8) this.setData({ debtHour8: !this.data.debtHour8 });
    if (h === 20) this.setData({ debtHour20: !this.data.debtHour20 });
  },
  onSetSummaryHour: function (e) {
    var h = parseInt(e.currentTarget.dataset.hour, 10);
    this.setData({ summaryHour: h });
  },
  onSubscribeNotify: function () {
    var tmplId = this.data.notifyTemplateId || subscribe.DEFAULT_TMPL;
    var that = this;
    wx.requestSubscribeMessage({
      tmplIds: [tmplId],
      success: function (res) {
        var accepted = res[tmplId] === 'accept';
        that.setData({ subscribeAuthorized: accepted });
        wx.showToast({ title: accepted ? '订阅成功' : '未授权', icon: 'none' });
        // 保存 openId 到服务端（服务端通过 session 自动获取，这里只做确认）
        api.request('POST', '/api/notify/subscribe', {}, function () {
          // 服务端已记录订阅
        });
      },
      fail: function () {
        wx.showToast({ title: '订阅失败', icon: 'none' });
      }
    });
  },
  onSaveNotify: function () {
    var that = this;
    var fid = this.data.familyId;
    // 组装通知配置
    var pickupHours = [];
    if (this.data.pickupHour8) pickupHours.push(8);
    if (this.data.pickupHour20) pickupHours.push(20);
    if (pickupHours.length === 0) pickupHours = [8];
    var debtHours = [];
    if (this.data.debtHour8) debtHours.push(8);
    if (this.data.debtHour20) debtHours.push(20);
    if (debtHours.length === 0) debtHours = [8];

    // 保存通知配置
    var notifyPatch = {
      enabled: this.data.notifyEnabled,
      daysBefore: this.data.notifyDays,
      pickupHours: pickupHours,
      debtHours: debtHours,
      summaryHour: this.data.summaryHour,
      minLevel: this.data.minLevel
    };
    api.request('PUT', '/api/notify/config' + (fid ? '?familyId=' + fid : ''), notifyPatch, function () {
      wx.setStorageSync('parcel.reminderDays', String(that.data.notifyDays));
      // 如果有 templateId，走 config 接口保存
      if (that.data.notifyTemplateId) {
        api.request('PUT', '/api/config' + (fid ? '?familyId=' + fid : ''), { notify: { templateId: that.data.notifyTemplateId } }, function () {});
      }
      // 保存清理天数
      api.request('PUT', '/api/config' + (fid ? '?familyId=' + fid : ''), { ignoreCleanupDays: that.data.notifyCleanupDays }, function () {
        wx.setStorageSync('parcel.ignoreCleanupDays', String(that.data.notifyCleanupDays));
        app.globalData.ignoreCleanupDays = that.data.notifyCleanupDays;
        that.setData({ showNotifyModal: false });
        wx.showToast({ title: '已保存', icon: 'success' });
      }, function () {
        wx.showToast({ title: '保存失败', icon: 'none' });
      });
    }, function () {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  // 关于弹窗
  onOpenAboutModal: function () {
    this.setData({ showAboutModal: true });
  },
  onCloseAboutModal: function () {
    this.setData({ showAboutModal: false });
  },
  onCopyGithub: function () {
    wx.setClipboardData({ data: 'https://github.com/zsunny6658/family-parcel-hub-api', success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
  },

  switchFamily: function (e) {
    var fid = e.currentTarget.dataset.id;
    app.globalData.familyId = fid;
    this.refresh();
    app.refreshState();
    wx.showToast({ title: '已切换', icon: 'success' });
  },

  onCopyBaseUrl: function () {
    wx.setClipboardData({ data: this.data.baseUrl, success: function () { wx.showToast({ title: '已复制', icon: 'success' }); } });
  },

  onEditProfile: function () {
    wx.navigateTo({ url: '/pages/settings/settings?action=profile' });
  },
  onChangePassword: function () {
    wx.navigateTo({ url: '/pages/settings/settings?action=password' });
  },
  onManageMembers: function () {
    wx.navigateTo({ url: '/pages/members/members' });
  },
  onManageTokens: function () {
    wx.navigateTo({ url: '/pages/settings/settings?action=tokens' });
  },
  onManageWebhooks: function () {
    wx.navigateTo({ url: '/pages/settings/settings?action=webhooks' });
  },
  onOpenArchive: function () {
    wx.navigateTo({ url: '/pages/archive/archive' });
  },
  onFamilySettings: function () {
    wx.navigateTo({ url: '/pages/settings/settings?action=mail' });
  },

  onLogout: function () {
    wx.showModal({
      title: '退出登录',
      content: '确定退出当前账号？',
      success: function (res) {
        if (res.confirm) {
          app.clearToken();
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  },
  onShareAppMessage: function () {
    return { title: '屋事小记 - 家庭快递取件码共享', path: '/pages/overview/overview' };
  },
  onShareTimeline: function () {
    return { title: '屋事小记 - 家庭快递取件码共享' };
  }
});
