// pages/me/me.js
var api = require('../../utils/api');
var app = getApp();

Page({
  data: {
    meName: '',
    meFirstChar: '?',
    meEmail: '',
    roleLabel: '成员',
    familyName: '',
    isAdmin: false,
    familyId: '',
    families: [],
    baseUrl: 'https://parcel.zsunny.top',
    viewOptions: ['📋 列表', '🎯 四象限'],
    viewIndex: 0,
    groupOptions: ['不分组', '按成员', '按待办类型'],
    groupIndex: 0,
    showCreateFamily: false,
    newFamilyName: ''
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
      meEmail: gd.meEmail || '',
      roleLabel: roleMap[role] || role,
      isAdmin: !!gd.isAdmin,
      familyId: gd.familyId || '',
      familyName: this.findFamilyName(gd.familyId),
      families: gd.families || [],
      baseUrl: gd.baseUrl || 'https://parcel.zsunny.top',
      viewIndex: (gd.viewMode === 'quadrant') ? 1 : 0,
      groupIndex: ['none', 'owner', 'type'].indexOf(gd.group || 'none'),
      showCreateFamily: false
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

  switchFamily: function (e) {
    var fid = e.currentTarget.dataset.id;
    app.globalData.familyId = fid;
    this.refresh();
    app.refreshState();
    wx.showToast({ title: '已切换', icon: 'success' });
  },

  onRefresh: function () {
    app.refreshState(function () { wx.showToast({ title: '已刷新', icon: 'success' }); });
  },

  onClearPicked: function () {
    var that = this;
    wx.showModal({
      title: '清理已完成',
      content: '删除所有已完成的记录？',
      success: function (res) {
        if (res.confirm) {
          api.clearPicked(function () {
            wx.showToast({ title: '已清理', icon: 'success' });
            app.refreshState();
          });
        }
      }
    });
  },

  onExport: function () {
    var pkgs = (app.globalData.packages || []).filter(function (p) { return p.status === 'pending'; });
    var lines = pkgs.map(function (p) {
      return (p.type === 'pickup' ? '【取件】' : '【备忘】') + p.code + (p.station ? ' @ ' + p.station : '') + (p.arrivedAt ? ' (' + new Date(p.arrivedAt).toLocaleString() + ')' : '');
    });
    if (!lines.length) { wx.showToast({ title: '没有待处理记录', icon: 'none' }); return; }
    wx.setClipboardData({ data: lines.join('\n'), success: function () { wx.showToast({ title: '已复制 ' + lines.length + ' 条', icon: 'success' }); } });
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
  }
});
