// pages/medboard/medboard.js - 仿真药板（点击打卡 + 前后对比）
var api = require('../../utils/api');
var app = getApp();

var COLOR_HEX = {
  white: '#F1F5F9', yellow: '#FBBF24', pink: '#F9A8D4', red: '#EF4444',
  blue: '#60A5FA', green: '#34D399', purple: '#A78BFA', orange: '#FB923C', brown: '#B45309'
};
var SHAPE_LABEL = { round: '圆形', oval: '椭圆形', capsule: '胶囊', square: '方形' };

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

function clamp(v, min, max, dft) {
  var n = parseInt(v, 10);
  return isNaN(n) ? dft : Math.max(min, Math.min(max, n));
}

Page({
  data: {
    pkg: null,
    colorHex: '#F1F5F9',
    shapeLabel: '圆形',
    boards: [],
    boardNo: 1,
    rows: [],
    slots: [],
    todayTaken: 0,
    todayTotal: 0,
    todayPercent: 0,
    boxRemaining: 0,
    compare: 'current',
    loading: true,
    error: ''
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    this.pkgId = (opts && opts.id) || '';
    this.allLogs = [];
    this.load();
  },

  onPullDownRefresh: function () {
    this.load();
    wx.stopPullDownRefresh();
  },

  load: function () {
    var that = this;
    api.getPackage(this.pkgId, function (data) {
      that.pkg = data.package || null;
      api.getMedLogs(that.pkgId, '', function (res) {
        that.allLogs = res.allLogs || [];
        that.setData({ loading: false, error: '' });
        that.applyData(res);
      }, function () {
        that.setData({ loading: false, error: '药板数据加载失败' });
      });
    }, function () {
      that.setData({ loading: false, error: '记录不存在或无权查看' });
    });
  },

  applyData: function (res) {
    var pkg = this.pkg || {};
    var pi = res.pillInfo || {};
    pi.color = COLOR_HEX[pi.color] ? pi.color : 'white';
    pi.shape = SHAPE_LABEL[pi.shape] ? pi.shape : 'round';
    pi.rows = clamp(pi.rows, 1, 4, 2);
    pi.cols = clamp(pi.cols, 1, 8, 5);
    pi.boards = clamp(pi.boards, 1, 6, 2);
    pi.boardNo = clamp(pi.boardNo, 1, pi.boards, 1);

    var today = todayStr();
    this.todayLogs = this.allLogs.filter(function (l) { return l.date === today; });
    var times = (pkg.schedule && pkg.schedule.times) || ['08:00', '20:00'];

    this.times = times;
    this.pi = pi;

    // 版 tab（各版累计消耗）
    var boards = [];
    for (var b = 1; b <= pi.boards; b++) {
      boards.push({
        no: b,
        taken: this.allLogs.filter(function (l) { return l.boardNo === b; }).length,
        cap: pi.rows * pi.cols
      });
    }

    // 今日时段 chips
    var slots = times.map(function (t, i) {
      var log = that.todayLogs.find(function (l) { return l.slotIndex === i; });
      return { index: i, time: t, taken: !!log, logId: log ? log.id : '', takenBy: log ? log.takenByName : '' };
    });

    var todayTaken = slots.filter(function (s) { return s.taken; }).length;
    this.setData({
      pkg: pkg,
      colorHex: COLOR_HEX[pi.color],
      shapeLabel: SHAPE_LABEL[pi.shape],
      pillShape: pi.shape,
      boards: boards,
      slots: slots,
      todayTaken: todayTaken,
      todayTotal: times.length,
      todayPercent: times.length ? Math.round(todayTaken * 100 / times.length) : 0,
      boxRemaining: pi.boards * pi.rows * pi.cols - this.allLogs.length
    });
    this.buildBoard();
  },

  buildBoard: function () {
    var pi = this.pi;
    var boardNo = this.data.boardNo;
    var cap = pi.rows * pi.cols;
    var cells = [];
    for (var i = 0; i < cap; i++) {
      var log = this.allLogs.find(function (l) { return l.boardNo === boardNo && l.pillIndex === i; });
      var todayLog = this.todayLogs.find(function (l) { return l.boardNo === boardNo && l.pillIndex === i; });
      cells.push({
        index: i,
        boardNo: boardNo,
        taken: !!log,
        takenAt: log ? (log.takenAt || '').slice(0, 10) : '',
        todayLogId: todayLog ? todayLog.id : '',
        showPill: this.data.compare === 'full' || !log,
        holeText: log ? '✓' : ''
      });
    }
    var rows = [];
    for (var r = 0; r < pi.rows; r++) {
      rows.push(cells.slice(r * pi.cols, (r + 1) * pi.cols));
    }
    this.setData({ rows: rows });
  },

  onCompareToggle: function (e) {
    var mode = e.currentTarget.dataset.mode;
    if (mode === this.data.compare) return;
    this.setData({ compare: mode });
    this.buildBoard();
  },

  onBoardTap: function (e) {
    var no = parseInt(e.currentTarget.dataset.no, 10);
    if (no === this.data.boardNo) return;
    this.setData({ boardNo: no });
    this.buildBoard();
  },

  // 点击药丸：记录为今日某次服药
  onPillTap: function (e) {
    var ds = e.currentTarget.dataset;
    var pillIndex = parseInt(ds.pill, 10);
    var boardNo = parseInt(ds.board, 10);
    if (ds.taken === 'true' || ds.taken === true) return;
    var untaken = this.data.slots.filter(function (s) { return !s.taken; });
    if (!untaken.length) {
      wx.showToast({ title: '今日已全部服用 ✓', icon: 'none' });
      return;
    }
    var that = this;
    if (untaken.length === 1) {
      wx.showModal({
        title: '记录服药',
        content: '将这颗药记为今日 ' + untaken[0].time + ' 那次服药？',
        success: function (r) { if (r.confirm) that.take(boardNo, pillIndex, untaken[0].index); }
      });
      return;
    }
    wx.showActionSheet({
      itemList: untaken.map(function (s) { return s.time + ' 那次'; }),
      success: function (r) {
        if (untaken[r.tapIndex]) that.take(boardNo, pillIndex, untaken[r.tapIndex].index);
      }
    });
  },

  take: function (boardNo, pillIndex, slotIndex) {
    var that = this;
    api.takeMed(this.pkgId, {
      slotIndex: slotIndex,
      boardNo: boardNo,
      pillIndex: pillIndex
    }, function (res) {
      if (res && res.log) {
        that.allLogs.push(res.log);
        that.setData({ boardNo: boardNo });
        that.load(); // 重新拉取，服务端可能已自动推进版号
        wx.showToast({ title: '已记录 ✓', icon: 'success' });
      }
    }, function () {
      // 失败提示已由 api 层统一 toast
    });
  },

  // 点按缺口 / 长按药丸：撤销今日打卡或查看历史
  onCellLongPress: function (e) {
    var ds = e.currentTarget.dataset;
    var pillIndex = parseInt(ds.pill, 10);
    var boardNo = parseInt(ds.board, 10);
    var taken = ds.taken === 'true' || ds.taken === true;
    if (!taken) return;
    var that = this;
    // 找到这颗药的所有服用记录
    var logs = this.allLogs.filter(function (l) { return l.boardNo === boardNo && l.pillIndex === pillIndex; });
    var todayLog = logs.find(function (l) { return l.date === todayStr(); });
    if (todayLog) {
      wx.showModal({
        title: '撤销打卡',
        content: '撤销今日对这颗药的打卡记录？',
        confirmColor: '#EF4444',
        success: function (r) {
          if (r.confirm) that.untake(todayLog.id);
        }
      });
    } else if (logs.length) {
      wx.showToast({ title: '这颗药 ' + logs[logs.length - 1].date + ' 已服用', icon: 'none' });
    }
  },

  untake: function (logId) {
    var that = this;
    api.untakeMed(this.pkgId, logId, function () {
      that.allLogs = that.allLogs.filter(function (l) { return l.id !== logId; });
      that.load();
      wx.showToast({ title: '已撤销', icon: 'success' });
    }, function () {});
  },

  onShareAppMessage: function () {
    return { title: '屋事小记 - 仿真药板打卡', path: '/pages/detail/detail?id=' + this.pkgId };
  }
});
