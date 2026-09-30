// pages/medboard/medboard.js - 仿真药板（点击打卡 + 前后对比 + 实时同步）
var api = require('../../utils/api');
var realtime = require('../../utils/realtime');
var subscribe = require('../../utils/subscribe');
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
    dueToday: true,
    todayPercent: 0,
    boxRemaining: 0,
    compare: 'current',
    compareRows: [],
    weekDays: [],
    weekRate: 0,
    streak: 0,
    timeline: [],
    loading: true,
    error: ''
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    this.pkgId = (opts && opts.id) || '';
    this.allLogs = [];
    this.load();
    this.initRealtime();
  },

  onUnload: function () {
    if (this._unsub) this._unsub();
  },

  // 家人打卡/撤销实时同步（SSE medlog:created/deleted）
  initRealtime: function () {
    var that = this;
    this._reloadTimer = null;
    this._unsub = realtime.subscribe(function (evt) {
      if (!evt || (evt.type !== 'medlog:created' && evt.type !== 'medlog:deleted')) return;
      if (evt.packageId && evt.packageId !== that.pkgId) return;
      if (that._reloadTimer) return; // 500ms 节流
      that._reloadTimer = setTimeout(function () {
        that._reloadTimer = null;
        that.load();
      }, 500);
    });
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
    var dueToday = res.dueToday !== undefined ? !!res.dueToday : true;
    var todayTotal = res.todayTotal != null ? res.todayTotal : times.length;

    // 近 7 天依从性（服务端 days：{date, taken, total}，下标 0 = 今天）
    var weekDays = (res.days || []).map(function (d, i) {
      var label;
      if (i === 0) label = '今天';
      else if (i === 1) label = '昨天';
      else label = d.date.slice(5).replace('-', '/');
      return {
        date: d.date,
        label: label,
        taken: d.taken,
        total: d.total,
        percent: d.total ? Math.round(d.taken * 100 / d.total) : 0,
        full: d.total > 0 && d.taken >= d.total,
        none: d.taken === 0
      };
    });
    // 7 天依从率 + 连续达标天数（从今天往前数）
    var sumT = 0, sumN = 0, streak = 0;
    weekDays.forEach(function (d) { sumT += d.taken; sumN += d.total; });
    for (var wi = 0; wi < weekDays.length; wi++) {
      if (weekDays[wi].total > 0 && weekDays[wi].taken >= weekDays[wi].total) streak++;
      else break;
    }
    var weekRate = sumN ? Math.round(sumT * 100 / sumN) : 0;

    // 今日打卡时间线（几点 · 谁 · 第几版第几行第几颗）
    var cols = pi.cols;
    var timeline = this.todayLogs.slice().sort(function (a, b) { return (a.takenAt || '').localeCompare(b.takenAt || ''); })
      .map(function (l) {
        var hm = (l.takenAt || '').slice(11, 16);
        return {
          id: l.id,
          time: l.time || hm,
          by: l.takenByName || '家人',
          pos: '第' + l.boardNo + '版 第' + (Math.floor(l.pillIndex / cols) + 1) + '行第' + (l.pillIndex % cols + 1) + '颗'
        };
      });

    this.setData({
      pkg: pkg,
      colorHex: COLOR_HEX[pi.color],
      shapeLabel: SHAPE_LABEL[pi.shape],
      pillShape: pi.shape,
      boards: boards,
      slots: slots,
      weekDays: weekDays,
      weekRate: weekRate,
      streak: streak,
      timeline: timeline,
      todayTaken: todayTaken,
      todayTotal: todayTotal,
      dueToday: dueToday,
      todayPercent: todayTotal ? Math.round(todayTaken * 100 / todayTotal) : 0,
      boxRemaining: pi.boards * pi.rows * pi.cols - this.allLogs.length
    });
    this.buildBoard();
  },

  buildBoard: function () {
    var pi = this.pi;
    var boardNo = this.data.boardNo;
    var today = todayStr();
    var cap = pi.rows * pi.cols;
    var cells = [];
    var beforeCells = [];
    for (var i = 0; i < cap; i++) {
      (function (idx) {
        var that2 = this;
        var logs = that2.allLogs.filter(function (l) { return l.boardNo === boardNo && l.pillIndex === idx; });
        var log = logs[logs.length - 1];
        var todayLog = logs.find(function (l) { return l.date === today; });
        var beforeLog = logs.find(function (l) { return l.date < today; }); // 今天之前已吃
        // 主板（现在）：已吃 → 缺口；今日刚吃的缺口高亮
        cells.push({
          index: idx,
          boardNo: boardNo,
          taken: !!log,
          takenAt: log ? (log.takenAt || '').slice(0, 10) : '',
          isToday: !!todayLog,
          todayLogId: todayLog ? todayLog.id : '',
          showPill: that2.data.compare === 'full' || !log,
          holeText: log ? '✓' : ''
        });
        // 对比板（今天之前）：仅历史缺口，今日吃的位置药丸仍在
        beforeCells.push({
          index: idx,
          boardNo: boardNo,
          taken: !!beforeLog,
          showPill: !beforeLog,
          holeText: beforeLog ? '✓' : ''
        });
      }).call(this, i);
    }
    var rows = [];
    for (var r = 0; r < pi.rows; r++) {
      rows.push(cells.slice(r * pi.cols, (r + 1) * pi.cols));
    }
    var compareRows = [];
    for (var r2 = 0; r2 < pi.rows; r2++) {
      compareRows.push(beforeCells.slice(r2 * pi.cols, (r2 + 1) * pi.cols));
    }
    this.setData({ rows: rows, compareRows: compareRows });
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

  // 点击药丸：记录为今日某次服药（任意位置乱序点击均可，无需按顺序）
  onPillTap: function (e) {
    var ds = e.currentTarget.dataset;
    var pillIndex = parseInt(ds.pill, 10);
    var boardNo = parseInt(ds.board, 10);
    if (!this.data.dueToday) {
      wx.showToast({ title: '今日非服药日，好好休息', icon: 'none' });
      return;
    }
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
        wx.vibrateShort({ type: 'light' }); // 打卡触感反馈
        // 打卡后顺带请求订阅授权（勾选"总是保持"后静默续配额，保障下次到点能推送）
        subscribe.askSubscribe();
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
