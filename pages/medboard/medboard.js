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

// 与服务端 store.isDueDate 保持一致的客户端复刻（月度热力图用）
function isDueClient(sched, ds) {
  if (!sched) return true;
  var freq = sched.freq || 'daily';
  if (freq === 'daily') return true;
  if (freq === 'weekly') {
    var wd = new Date(ds + 'T00:00:00').getDay();
    var days = Array.isArray(sched.weekdays) ? sched.weekdays : [];
    return days.indexOf(wd) >= 0;
  }
  if (freq === 'interval') {
    var anchor = String(sched.startDate || '');
    var iv = Math.max(2, parseInt(sched.intervalDays, 10) || 2);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor)) return true;
    var diff = Math.round((new Date(ds + 'T00:00:00') - new Date(anchor + 'T00:00:00')) / 86400000);
    return diff >= 0 && diff % iv === 0;
  }
  return true;
}

// 当前月热力图：{monthLabel, cells:[{d,state,taken,total}], blanks}
// state: full=达标绿 / part=部分黄 / due=未吃灰红 / off=非服药日浅灰 / future=未到
function buildMonthCells(sched, allLogs, times) {
  var now = new Date();
  var y = now.getFullYear(), m = now.getMonth();
  var dim = new Date(y, m + 1, 0).getDate();
  var offset = new Date(y, m, 1).getDay(); // 周日=0 起
  var cells = [];
  for (var d = 1; d <= dim; d++) {
    var ds = y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + d).slice(-2);
    var due = isDueClient(sched, ds);
    var total = due ? times.length : 0;
    var taken = allLogs.filter(function (l) { return l.date === ds; }).length;
    var state;
    if (d > now.getDate()) state = 'future';
    else if (!due) state = 'off';
    else if (total && taken >= total) state = 'full';
    else if (taken > 0) state = 'part';
    else state = 'due';
    cells.push({ d: d, state: state, taken: taken, total: total });
  }
  var rate = 0, dueCnt = 0, fullCnt = 0;
  cells.forEach(function (c) {
    if (c.state === 'full') { dueCnt++; fullCnt++; }
    else if (c.state === 'part' || c.state === 'due') dueCnt++;
  });
  if (dueCnt) rate = Math.round(fullCnt * 100 / dueCnt);
  return {
    monthLabel: (m + 1) + ' 月',
    monthRate: rate,
    blanks: new Array(offset).fill(0),
    cells: cells
  };
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
    compareBefore: 0,
    compareLastDate: '',
    weekDays: [],
    weekRate: 0,
    streak: 0,
    timeline: [],
    loading: true,
    error: '',
    // 初始化模式：一次会话逐版设置，最后统一提交
    initializing: false,
    initBoardNo: 1,
    initTabs: [],
    initCellRows: [],
    initTotalTaken: 0
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    this.pkgId = (opts && opts.id) || '';
    this.allLogs = [];
    // 详情页「初始化药板」入口：加载完成后自动进入初始化模式
    this._autoInit = !!(opts && (opts.init === '1' || opts.init === 1));
    this.load();
    this.initRealtime();
  },

  onUnload: function () {
    if (this._unsub) this._unsub();
  },

  // 家人打卡/撤销实时同步（SSE medlog:created/deleted）+ 连接状态黄条
  initRealtime: function () {
    var that = this;
    this._reloadTimer = null;
    this._unsub = realtime.subscribe(function (evt) {
      if (!evt || (evt.type !== 'medlog:created' && evt.type !== 'medlog:deleted')) return;
      if (evt.packageId && evt.packageId !== that.pkgId) return;
      if (that._reloadTimer) return; // 500ms 节流
      that._reloadTimer = setTimeout(function () {
        that._reloadTimer = null;
        // 自己刚操作过（乐观更新已生效）：3s 内抑制广播回环 reload，避免闪烁
        if (Date.now() - (that._selfAction || 0) < 3000) return;
        that.load();
      }, 500);
    }, function (st) {
      that.setData({ rtOff: st === 'offline' });
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
    var that = this;
    var pkg = this.pkg || {};
    // 缓存服务端响应供打卡/撤销后本地重算（乐观更新，免全页拉取闪烁）
    this._lastRes = res;
    var pi = res.pillInfo || {};
    pi.color = COLOR_HEX[pi.color] ? pi.color : 'white';
    pi.shape = SHAPE_LABEL[pi.shape] ? pi.shape : 'round';
    pi.rows = clamp(pi.rows, 1, 4, 2);
    pi.cols = clamp(pi.cols, 1, 8, 5);
    pi.boards = clamp(pi.boards, 1, 6, 2);
    pi.boardNo = clamp(pi.boardNo, 1, pi.boards, 1);
    pi.boxNo = clamp(pi.boxNo, 1, 999, 1);

    var today = todayStr();
    this.todayLogs = this.allLogs.filter(function (l) { return l.date === today; });
    // 当前盒流水（开新盒后旧盒历史保留，不参与当前盒统计/药板渲染）
    var box = pi.boxNo || 1;
    this.boxLogs = this.allLogs.filter(function (l) { return (l.boxNo || 1) === box; });
    var times = (pkg.schedule && pkg.schedule.times) || ['08:00', '20:00'];

    this.times = times;
    this.pi = pi;

    // 版 tab（当前盒各版累计消耗；isCurrent = 服务端当前正在吃的版，徽标提示）
    var boxLogsRef = this.boxLogs;
    var boards = [];
    for (var b = 1; b <= pi.boards; b++) {
      boards.push({
        no: b,
        taken: boxLogsRef.filter(function (l) { return l.boardNo === b; }).length,
        cap: pi.rows * pi.cols,
        isCurrent: b === (pi.boardNo || 1)
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
        due: !!d.due,
        catchable: i > 0 && !!d.due && d.taken < d.total, // 过去 6 天内服药日+没吃满 → 可补记
        percent: d.total ? Math.round(d.taken * 100 / d.total) : 0,
        full: d.total > 0 && d.taken >= d.total,
        none: d.taken === 0
      };
    });
    // 今天一行用本地 todayLogs 实时校准（打卡/撤销后 _lastRes.days 里今天的数据会过期）
    if (weekDays[0] && weekDays[0].date === today) {
      var tTaken = this.todayLogs.length;
      weekDays[0].taken = tTaken;
      weekDays[0].percent = weekDays[0].total ? Math.round(tTaken * 100 / weekDays[0].total) : 0;
      weekDays[0].full = weekDays[0].total > 0 && tTaken >= weekDays[0].total;
      weekDays[0].none = tTaken === 0;
    }
    // 7 天依从率 + 连续达标天数（从今天往前数）
    var sumT = 0, sumN = 0, streak = 0;
    weekDays.forEach(function (d) { sumT += d.taken; sumN += d.total; });
    for (var wi = 0; wi < weekDays.length; wi++) {
      if (weekDays[wi].total > 0 && weekDays[wi].taken >= weekDays[wi].total) streak++;
      else break;
    }
    var weekRate = sumN ? Math.round(sumT * 100 / sumN) : 0;

    // 按列数自适应药丸/缺口尺寸（防止 6-8 列时固定 88rpx 药丸互相重叠）
    // 主板可用宽 ≈ 750 - 页面 padding48 - 药板 padding44；对比小板再缩 0.66
    var SH = { round: [88, 88], oval: [108, 68], capsule: [120, 54], square: [88, 88] }[pi.shape] || [88, 88];
    var cellW = Math.floor((750 - 48 - 44) / pi.cols);
    var maxW = Math.floor(cellW * 0.8);
    var minH = Math.max(Math.floor(cellW * 0.55), 34);
    var pw = Math.min(SH[0], maxW), ph = Math.min(SH[1], minH);
    var pwM = Math.floor(pw * 0.66), phM = Math.floor(ph * 0.66);
    var radOf = function (h) { return pi.shape === 'square' ? Math.round(h * 0.16) : (pi.shape === 'round' ? 999 : Math.round(h / 2)); };
    var pillStyle = 'width:' + pw + 'rpx;height:' + ph + 'rpx;border-radius:' + radOf(ph) + 'rpx;';
    var holeStyle = 'width:' + Math.min(88, maxW) + 'rpx;height:' + Math.min(88, minH) + 'rpx;border-radius:' + radOf(minH) + 'rpx;';
    var pillStyleMini = 'width:' + pwM + 'rpx;height:' + phM + 'rpx;border-radius:' + radOf(phM) + 'rpx;';
    var holeStyleMini = 'width:' + Math.floor(Math.min(88, maxW) * 0.66) + 'rpx;height:' + Math.floor(Math.min(88, minH) * 0.66) + 'rpx;border-radius:' + radOf(Math.floor(minH * 0.66)) + 'rpx;';

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

    // 月度依从热力图
    var month = buildMonthCells(pkg.schedule || null, this.allLogs, times);

    // 视图版号：首次加载跟随服务端当前版；打满自动推进/撤销回退（服务端版号变化）时跟随；
    // 其余情况保留用户正在查看的版，避免打卡后视图被强行跳回当前版
    var serverBoard = pi.boardNo || 1;
    var viewBoard;
    if (!this._prevServerBoard || serverBoard !== this._prevServerBoard) {
      viewBoard = serverBoard;
    } else {
      viewBoard = clamp(this.data.boardNo, 1, pi.boards, serverBoard);
    }
    this._prevServerBoard = serverBoard;

    this.setData({
      pkg: pkg,
      schedTimes: times.join(' / '),
      schedCount: times.length,
      colorHex: COLOR_HEX[pi.color],
      shapeLabel: SHAPE_LABEL[pi.shape],
      pillShape: pi.shape,
      pillStyle: pillStyle,
      holeStyle: holeStyle,
      pillStyleMini: pillStyleMini,
      holeStyleMini: holeStyleMini,
      boards: boards,
      slots: slots,
      boardNo: viewBoard,
      weekDays: weekDays,
      weekRate: weekRate,
      streak: streak,
      monthLabel: month.monthLabel,
      monthRate: month.monthRate,
      monthBlanks: month.blanks,
      monthCells: month.cells,
      timeline: timeline,
      todayTaken: todayTaken,
      todayTotal: todayTotal,
      dueToday: dueToday,
      todayPercent: todayTotal ? Math.round(todayTaken * 100 / todayTotal) : 0,
      boxNo: box,
      boxRemaining: pi.boards * pi.rows * pi.cols - this.boxLogs.length,
      boxFinished: this.boxLogs.length >= pi.boards * pi.rows * pi.cols
    });
    this.buildBoard();
    // 详情页「初始化药板」入口直达：加载完成后自动进入初始化模式（默认停在当前版）
    if (this._autoInit) {
      this._autoInit = false;
      this.startInitMode(this.pi.boardNo || 1);
    }
  },

  buildBoard: function () {
    var pi = this.pi;
    var boardNo = this.data.boardNo;
    var box = pi.boxNo || 1;
    var today = todayStr();
    var cap = pi.rows * pi.cols;
    var cells = [];
    var beforeCells = [];
    // 对比板健康度：当前盒当前版"今天之前"的真实缺口数（开新盒首日/未开吃的新版 = 0 → 双板降级为单板）
    var beforeCount = 0;
    var lastBeforeDate = '';
    for (var i = 0; i < cap; i++) {
      (function (idx) {
        var that2 = this;
        var logs = that2.boxLogs.filter(function (l) { return l.boardNo === boardNo && (l.boxNo || 1) === box && l.pillIndex === idx; });
        var log = logs[logs.length - 1];
        var todayLog = logs.find(function (l) { return l.date === today; });
        var beforeLog = logs.find(function (l) { return l.date < today; }); // 今天之前已吃
        if (beforeLog) {
          beforeCount++;
          // 初始化占位（2000-01-01）计入缺口但不参与"最近服用日期"展示
          if (beforeLog.date !== '2000-01-01' && beforeLog.date > lastBeforeDate) lastBeforeDate = beforeLog.date;
        }
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
    this.setData({ rows: rows, compareRows: compareRows, compareBefore: beforeCount, compareLastDate: lastBeforeDate ? lastBeforeDate.slice(5).replace('-', '/') : '' });
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

  // 开新盒：盒号 +1、版号重置 1；完成后自动进入初始化模式（新盒已吃几颗可预填/拍照识别）
  onNewBox: function () {
    var that = this;
    if (this._newBoxBusy) return;
    wx.showModal({
      title: '开新盒',
      content: '将开始第 ' + ((this.pi.boxNo || 1) + 1) + ' 盒：版号重置为第 1 版，历史打卡流水全部保留。新盒已吃过的位置可在初始化时标记。',
      confirmText: '开新盒',
      success: function (r) {
        if (!r.confirm) return;
        that._newBoxBusy = true;
        wx.showLoading({ title: '开启中…', mask: true });
        api.openMedBox(that.pkgId, function () {
          that._newBoxBusy = false;
          wx.hideLoading();
          wx.vibrateShort({ type: 'light' });
          that._selfAction = Date.now();
          that._autoInit = true; // load 完成后自动进入初始化模式
          that.load();
          wx.showToast({ title: '已开新盒，请标记新盒已吃位置', icon: 'none', duration: 2500 });
        }, function () {
          that._newBoxBusy = false;
          wx.hideLoading();
          wx.showToast({ title: '操作失败，请重试', icon: 'none' });
        });
      }
    });
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
        that._selfAction = Date.now();
        that.allLogs.push(res.log);
        wx.vibrateShort({ type: 'light' }); // 打卡触感反馈
        // 打卡后顺带请求订阅授权（勾选"总是保持"后静默续配额，保障下次到点能推送）
        subscribe.askSubscribe();
        // 服务端可能自动推进版号：当前版打满 → 本地同步推进，免拉取
        var cap = that.pi.rows * that.pi.cols;
        var bt = (res.boardTaken || []).find(function (b) { return b.boardNo === res.log.boardNo; });
        var pinfo = that._lastRes && that._lastRes.pillInfo;
        if (bt && bt.taken >= cap && res.log.boardNo < that.pi.boards && pinfo && (pinfo.boardNo || 1) === res.log.boardNo) {
          pinfo.boardNo = res.log.boardNo + 1;
        }
        var wasFinished = that.data.boxFinished;
        that.applyData(that._lastRes); // 本地重算全部统计 + 药板（乐观更新）
        that.playPopAnim(res.log.pillIndex); // 打卡成功弹跳动效
        wx.showToast({ title: '已记录 ✓', icon: 'success' });
        // 整盒吃完：弹窗引导开新盒（历史流水保留，新盒可初始化预填/拍照识别）
        if (!wasFinished && that.data.boxFinished) {
          setTimeout(function () {
            wx.showModal({
              title: '整盒已服完 🎉',
              content: '「' + (that.pkg && that.pkg.code || '本药') + '」第 ' + (that.pi.boxNo || 1) + ' 盒已全部服完。要开新盒吗？开新盒后可初始化预填已吃位置。',
              confirmText: '开新盒',
              cancelText: '稍后',
              success: function (r) { if (r.confirm) that.onNewBox(); }
            });
          }, 800);
        }
      }
    }, function () {
      // 失败提示已由 api 层统一 toast
    });
  },

  // 点按缺口 / 长按药丸：撤销今日打卡或查看历史
  // 点按缺口：今日已服 → 撤销确认；历史缺口 → 提示服用日期
  onTodayHoleTap: function (e) {
    var ds = e.currentTarget.dataset;
    var pillIndex = parseInt(ds.pill, 10);
    var boardNo = parseInt(ds.board, 10);
    var that = this;
    var box = this.pi.boxNo || 1;
    var logs = this.allLogs.filter(function (l) { return l.boardNo === boardNo && l.pillIndex === pillIndex && (l.boxNo || 1) === box; });
    if (!logs.length) return;
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
    } else {
      var last = logs[logs.length - 1];
      var isInitMark = last.date === '2000-01-01';
      wx.showToast({ title: isInitMark ? '这颗药在初始化时已标记服用' : '这颗药 ' + last.date + ' 已服用', icon: 'none' });
    }
  },

  onCellLongPress: function (e) {
    var ds = e.currentTarget.dataset;
    var pillIndex = parseInt(ds.pill, 10);
    var boardNo = parseInt(ds.board, 10);
    var taken = ds.taken === 'true' || ds.taken === true;
    if (!taken) return;
    var that = this;
    var boxCur = this.pi.boxNo || 1;
    // 找到这颗药的所有服用记录
    var logs = this.allLogs.filter(function (l) { return l.boardNo === boardNo && l.pillIndex === pillIndex && (l.boxNo || 1) === boxCur; });
    var todayLog = logs.find(function (l) { return l.date === todayStr() && (l.boxNo || 1) === boxCur; });
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

  // 打卡成功弹跳动效：定向标记该格 pop，700ms 后清除（不清 rows 节点树）
  playPopAnim: function (pillIndex) {
    var that = this;
    var cols = (this.pi && this.pi.cols) || 5;
    var r = Math.floor(pillIndex / cols), c = pillIndex % cols;
    this.setData({ ['rows[' + r + '][' + c + '].pop']: true });
    if (this._popTimer) clearTimeout(this._popTimer);
    this._popTimer = setTimeout(function () {
      that.setData({ ['rows[' + r + '][' + c + '].pop']: false });
    }, 700);
  },

  untake: function (logId) {
    var that = this;
    api.untakeMed(this.pkgId, logId, function () {
      that._selfAction = Date.now();
      that.allLogs = that.allLogs.filter(function (l) { return l.id !== logId; });
      that.applyData(that._lastRes); // 本地重算（乐观更新）
      wx.showToast({ title: '已撤销', icon: 'success' });
    }, function () {});
  },

  // 补记：近 7 天内任意未满的服药日，ActionSheet 选漏掉的时段，药位取当前版第一个未吃位置
  onWeekCatchup: function (e) {
    var date = e.currentTarget.dataset.date;
    if (!date) return;
    var dayLabel = date.slice(5).replace('-', '/');
    var wd = (this.data.weekDays || []).find(function (d) { return d.date === date; });
    if (wd && wd.label) dayLabel = wd.label;
    var sched = (this.pkg && this.pkg.schedule) || {};
    var times = this.times || (sched.times || []);
    var yLogs = this.allLogs.filter(function (l) { return l.date === date; });
    var untaken = [];
    times.forEach(function (t, i) {
      if (!yLogs.some(function (l) { return l.slotIndex === i; })) untaken.push({ index: i, time: t });
    });
    if (!untaken.length) {
      wx.showToast({ title: dayLabel + '已全部记录 ✓', icon: 'none' });
      return;
    }
    // 药位：当前版第一个未吃的位置（补记 = 那颗药该日实际已吃掉）
    var boardNo = this.data.boardNo;
    var cap = this.pi.rows * this.pi.cols;
    var pillIndex = -1;
    for (var i = 0; i < cap; i++) {
      var used = this.allLogs.some(function (l) { return l.boardNo === boardNo && l.pillIndex === i && l.date <= date; });
      if (!used) { pillIndex = i; break; }
    }
    if (pillIndex < 0) {
      wx.showToast({ title: '当前版已无未吃药丸，请先切版', icon: 'none' });
      return;
    }
    var that = this;
    var pick = function (slotIndex) {
      api.takeMed(that.pkgId, {
        slotIndex: slotIndex,
        boardNo: boardNo,
        pillIndex: pillIndex,
        date: date
      }, function (res) {
        if (res && res.log) {
          that.allLogs.push(res.log);
          wx.vibrateShort({ type: 'light' });
          that.load();
          wx.showToast({ title: '已补记 ✓', icon: 'success' });
        }
      }, function () {});
    };
    if (untaken.length === 1) {
      wx.showModal({
        title: '补记 ' + dayLabel,
        content: '将这颗药记为 ' + dayLabel + ' ' + untaken[0].time + ' 那次服药？',
        success: function (r) { if (r.confirm) pick(untaken[0].index); }
      });
      return;
    }
    wx.showActionSheet({
      itemList: untaken.map(function (s) { return s.time + ' 那次'; }),
      success: function (r) {
        if (untaken[r.tapIndex]) pick(untaken[r.tapIndex].index);
      }
    });
  },

  // 初始化药板：直接进入初始化模式，界面内逐版设置，最后统一完成
  onResetBoard: function () {
    this.startInitMode(this.pi.boardNo || this.data.boardNo || 1);
  },

  // 进入初始化模式：一次会话设置所有版；预填各版已有的初始化占位标记
  startInitMode: function (curBoard) {
    var pi = this.pi || {};
    var box = pi.boxNo || 1;
    var states = {};
    (this.allLogs || []).forEach(function (l) {
      if (l.date === '2000-01-01' && (l.boxNo || 1) === box) {
        var b = l.boardNo || 1;
        if (!states[b]) states[b] = {};
        states[b][l.pillIndex] = true;
      }
    });
    this._initBoardStates = states;
    this._initBoardNo = clamp(curBoard, 1, pi.boards || 2, 1);
    this.setData({ initializing: true, initBoardNo: this._initBoardNo });
    this.updateInitData();
    wx.showToast({ title: '逐版划选已吃位置，完成后点「完成」', icon: 'none', duration: 2500 });
  },

  // 初始化模式数据刷新：各版 tab 计数 + 当前版网格 + 总标记数
  updateInitData: function () {
    var pi = this.pi || {};
    var cap = pi.rows * pi.cols;
    var states = this._initBoardStates || {};
    var tabs = [];
    var total = 0;
    for (var b = 1; b <= pi.boards; b++) {
      var n = Object.keys(states[b] || {}).length;
      total += n;
      tabs.push({ no: b, taken: n, cap: cap });
    }
    var boardNo = this._initBoardNo;
    var set = states[boardNo] || {};
    var rows = [];
    var cells = [];
    for (var i = 0; i < cap; i++) {
      cells.push({ index: i, boardNo: boardNo, taken: !!set[i], showPill: !set[i] });
    }
    for (var r = 0; r < pi.rows; r++) {
      rows.push(cells.slice(r * pi.cols, (r + 1) * pi.cols));
    }
    this.setData({ initTabs: tabs, initCellRows: rows, initTotalTaken: total });
  },

  // 初始化模式内切换版
  onInitBoardTap: function (e) {
    if (!this.data.initializing) return;
    var no = parseInt(e.currentTarget.dataset.no, 10);
    if (no === this._initBoardNo) return;
    this._initBoardNo = no;
    this.setData({ initBoardNo: no });
    this.updateInitData();
  },

  // 拍照识别当前版已吃位置：AI 视觉识别空泡罩 → 预填标记 → 人工核对微调（仍走原「完成」保存链路）
  onInitPhoto: function () {
    if (!this.data.initializing || this._photoBusy) return;
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['compressed'],
      success: function (res) {
        var f = res.tempFiles && res.tempFiles[0];
        if (!f || !f.tempFilePath) return;
        wx.getFileSystemManager().readFile({
          filePath: f.tempFilePath,
          encoding: 'base64',
          success: function (r) {
            that._photoBusy = true;
            wx.showLoading({ title: '识别中…', mask: true });
            api.recognizeMedBoard(that.pkgId, 'data:image/jpeg;base64,' + r.data, function (data) {
              that._photoBusy = false;
              wx.hideLoading();
              var taken = (data && data.taken) || [];
              var b = that._initBoardNo;
              if (!taken.length) {
                wx.showModal({
                  title: '未识别到已吃位置',
                  content: '可能是新板未拆、照片不清晰或拍摄角度倾斜。可重拍或直接手工划选标记。',
                  showCancel: false,
                  confirmText: '好的'
                });
                return;
              }
              if (!that._initBoardStates[b]) that._initBoardStates[b] = {};
              taken.forEach(function (idx) { that._initBoardStates[b][idx] = true; });
              that.updateInitData(); // 非滑动期间，全量刷新安全
              wx.vibrateShort({ type: 'light' });
              wx.showToast({
                title: '识别 ' + taken.length + ' 颗已吃（置信度 ' + ((data && data.confidence) || 0) + '%）已预填，请核对微调',
                icon: 'none',
                duration: 3000
              });
            }, function (msg) {
              that._photoBusy = false;
              wx.hideLoading();
              wx.showModal({
                title: '识别失败',
                content: (msg || '请检查 AI 视觉模型配置') + '。仍可手工划选标记。',
                showCancel: false,
                confirmText: '好的'
              });
            });
          },
          fail: function () {
            wx.showToast({ title: '读取照片失败', icon: 'none' });
          }
        });
      }
    });
  },

  // 初始化模式：点击/按住划过药丸标记已吃（paint：起始格取反决定涂「标记」还是「取消」，划过即应用）
  // 注意：滑动期间只用定向路径 setData（不重建节点树），否则触点节点被替换会切断 touch 事件流
  onInitPaintStart: function (e) {
    if (!this.data.initializing) return;
    this.onInitPaintEnd(); // 兜底：上一次滑动可能没收到 touchend/cancel
    var idx = parseInt(e.currentTarget.dataset.pill, 10);
    var set = this._initBoardStates[this._initBoardNo] || {};
    this._paintActive = true;
    this._paintValue = !set[idx];
    this.paintCell(idx, this._paintValue);
    // 缓存网格原点（第 0 个 cell 的位置与尺寸，cell flex:1 均分 + 固定高，可推算任意格；
    // touchmove 只派发到起始元素，需自行做坐标命中）
    var that = this;
    this.createSelectorQuery().select('.init-cell').boundingClientRect(function (r0) {
      that._cell0 = r0;
    }).exec();
  },

  onInitPaintMove: function (e) {
    if (!this._paintActive) return;
    var t = e.touches && e.touches[0];
    var c0 = this._cell0;
    if (!t || !c0 || !c0.width) return;
    var pi = this.pi || {};
    var cols = pi.cols || 5, rows = pi.rows || 2;
    var col = Math.floor((t.clientX - c0.left) / c0.width);
    var row = Math.floor((t.clientY - c0.top) / c0.height);
    if (col < 0 || col >= cols || row < 0 || row >= rows) return; // 划出板外不标记
    this.paintCell(row * cols + col, this._paintValue);
  },

  onInitPaintEnd: function () {
    if (!this._paintActive) return;
    this._paintActive = false;
    this._cell0 = null;
    this.updateInitData(); // 抬手后全量校准一次（此时无活跃 touch，重建安全）
  },

  paintCell: function (idx, value) {
    var b = this._initBoardNo;
    var states = this._initBoardStates;
    if (!states[b]) states[b] = {};
    var set = states[b];
    if (value ? !!set[idx] : !set[idx]) return; // 状态无变化
    if (value) set[idx] = true; else delete set[idx];
    // 定向路径更新：只改叶子属性，节点树保持稳定，touch 事件流不断
    var pi = this.pi || {};
    var cols = pi.cols || 5;
    var r = Math.floor(idx / cols), c = idx % cols;
    var patch = {};
    patch['initCellRows[' + r + '][' + c + '].taken'] = !!value;
    patch['initCellRows[' + r + '][' + c + '].showPill'] = !value;
    var tab = this.data.initTabs[b - 1];
    if (tab) patch['initTabs[' + (b - 1) + '].taken'] = tab.taken + (value ? 1 : -1);
    patch.initTotalTaken = this.data.initTotalTaken + (value ? 1 : -1);
    this.setData(patch);
    var now = Date.now();
    if (now - (this._lastVib || 0) > 80) { this._lastVib = now; wx.vibrateShort({ type: 'light' }); }
  },

  // 退出初始化模式
  onInitCancel: function () {
    this._initBoardStates = null;
    this._paintActive = false;
    this._cell0 = null;
    this.setData({ initializing: false, initTabs: [], initCellRows: [], initTotalTaken: 0 });
  },

  // 完成初始化：对本次涉及的所有版逐版串行提交
  onInitConfirm: function () {
    var that = this;
    var states = this._initBoardStates || {};
    var list = Object.keys(states).map(function (k) {
      return { boardNo: parseInt(k, 10), set: states[k] };
    }).filter(function (it) { return it.boardNo >= 1; }).sort(function (a, b) { return a.boardNo - b.boardNo; });
    if (!list.length) {
      wx.showToast({ title: '还没标记任何位置', icon: 'none' });
      return;
    }
    var total = list.reduce(function (s, it) { return s + Object.keys(it.set).length; }, 0);
    var parts = list.map(function (it) { return '第' + it.boardNo + '版 ' + Object.keys(it.set).length + ' 颗'; }).join('、');
    wx.showModal({
      title: '完成初始化',
      content: '共标记 ' + total + ' 颗已吃（' + parts + '）。将重置这些版的已吃记录，其他版不受影响。确定吗？',
      confirmColor: '#10B981',
      success: function (r) {
        if (r.confirm) that.submitInitBoards(list, 0);
      }
    });
  },

  submitInitBoards: function (list, i) {
    var that = this;
    if (i >= list.length) {
      this._initBoardStates = null;
      this.setData({ initializing: false, initTabs: [], initCellRows: [], initTotalTaken: 0, boardNo: list[0].boardNo });
      this.allLogs = [];
      this.load();
      wx.showToast({ title: '初始化完成', icon: 'success' });
      return;
    }
    var item = list[i];
    // 服务端 initializeMedBoard 契约：takenPositions = [{boardNo, pillIndex}] 对象数组
    var taken = Object.keys(item.set).map(function (k) {
      return { boardNo: item.boardNo, pillIndex: parseInt(k, 10) };
    });
    api.resetMedBoard(this.pkgId, item.boardNo, taken, function () {
      that.submitInitBoards(list, i + 1);
    }, function () {
      wx.showToast({ title: '第' + item.boardNo + '版初始化失败', icon: 'none' });
    });
  },

  onShareAppMessage: function () {
    return { title: '屋事小记 - 仿真药板打卡', path: '/pages/detail/detail?id=' + this.pkgId };
  }
});
