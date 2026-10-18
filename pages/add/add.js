// pages/add/add.js
var api = require('../../utils/api');
var subscribe = require('../../utils/subscribe');
var app = getApp();

// freqOptions 下标 → schedule.freq 映射（统一维护，模板/保存共用，勿再硬编码下标）
var FREQ_MAP = [
  { freq: 'daily' },
  { freq: 'interval', intervalDays: 2 },
  { freq: 'interval', intervalDays: 3 },
  { freq: 'weekly' }
];

function today() { var d = new Date(); return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2); }
function nowTime() { var d = new Date(); return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2); }

// 快捷输入历史（本地 storage，最多记 8 条）
var HIST_KEYS = { station: 'fph_hist_station', company: 'fph_hist_company', note: 'fph_hist_note' };
// 内置主流快递公司清单（优先级在历史记录之后）
var BUILTIN_COURIERS = ['顺丰速运', '中通快递', '圆通速递', '申通快递', '韵达快递', '京东物流', '极兔速递', 'EMS', '德邦快递', '菜鸟裹裦'];
// 内置常用备注模板
var BUILTIN_NOTES = ['放前台', '放柜子', '放门口', '到柜自取', '联系我'];

Page({
  data: {
    editId: '',
    editTitle: '',
    type: 'pickup',
    typeIndex: 0,
    showMore: false,
    moreFilled: false,
    typeOptions: ['📦 取件码', '📝 文本备忘', '💳 待还款', '💊 用药提醒'],
    doseOptions: ['每日1次', '每日2次', '每日3次', '每日4次'],
    freqOptions: ['每天', '隔1天', '每3天', '每周固定几日'],
    freqIndex: 0,
    showWeekChips: false,
    pillBoardOpen: false,
    weekChips: [{ v: 1, l: '一' }, { v: 2, l: '二' }, { v: 3, l: '三' }, { v: 4, l: '四' }, { v: 5, l: '五' }, { v: 6, l: '六' }, { v: 0, l: '日' }],
    selWeekdays: [1, 3, 5],
    doseIndex: 1,
    medTimes: ['08:00', '20:00'],
    pillColorOptions: ['white', 'yellow', 'pink', 'red', 'blue', 'green', 'purple', 'orange', 'brown'],
    pillColorHex: { white: '#F1F5F9', yellow: '#FBBF24', pink: '#F9A8D4', red: '#EF4444', blue: '#60A5FA', green: '#34D399', purple: '#A78BFA', orange: '#FB923C', brown: '#B45309' },
    pillShapeOptions: [
      { value: 'round', label: '圆形' },
      { value: 'oval', label: '椭圆形' },
      { value: 'capsule', label: '胶囊' },
      { value: 'square', label: '方形' }
    ],
    pillInfo: { color: 'white', shape: 'round', rows: 2, cols: 5, boards: 2, boardNo: 1 },
    pillPreviewRows: [],
    pillPrevStyle: '',
    form: { station: '', code: '', company: '', trackingNo: '', note: '', institution: '', amount: '' },
    stationChips: [],
    courierChips: [],
    noteChips: [],
    dueDateStr: '',
    isPrivate: false,
    smartText: '',
    imageTempPaths: [],
    imageBase64List: [],
    imageParsing: false,
    dateStr: today(),
    timeStr: nowTime(),
    endDate: '2099-12-31',
    memberOptions: ['不指定'],
    memberIndex: 0,
    assigneeIndex: 0,
    assignerIndex: 0,
    impOptions: ['🔴 高', '🟡 中', '⚪ 低'],
    impIndex: 1,
    urgOptions: ['⚡ 紧急', '🕐 普通'],
    urgIndex: 1
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    var members = (app.globalData.members || []).map(function (m) { return m.name; });
    this.setData({ memberOptions: ['不指定'].concat(members) });
    this.refreshPillPreview();
    this.refreshQuickChips();
    // 恢复草稿：仅新建模式（编辑模式不恢复），草稿 3 天过期
    if (!opts || !opts.id) {
      try {
        var raw = wx.getStorageSync('fph_add_draft_v1');
        if (raw) {
          var draft = typeof raw === 'string' ? JSON.parse(raw) : raw;
          if (draft && draft.ts && Date.now() - draft.ts < 3 * 86400000 && draft.type) {
            this.setData({
              type: draft.type,
              typeIndex: draft.typeIndex || 0,
              form: draft.form || this.data.form,
              dueDateStr: draft.dueDateStr || '',
              medTimes: draft.medTimes || this.data.medTimes,
              doseIndex: draft.doseIndex != null ? draft.doseIndex : this.data.doseIndex,
              freqIndex: draft.freqIndex != null ? draft.freqIndex : 0,
              selWeekdays: draft.selWeekdays || this.data.selWeekdays,
              pillInfo: draft.pillInfo || this.data.pillInfo,
              isPrivate: !!draft.isPrivate,
              impIndex: draft.impIndex != null ? draft.impIndex : this.data.impIndex,
              urgIndex: draft.urgIndex != null ? draft.urgIndex : this.data.urgIndex,
              memberIndex: draft.memberIndex != null ? draft.memberIndex : 0,
              assigneeIndex: draft.assigneeIndex != null ? draft.assigneeIndex : 0
            });
            this.refreshPillPreview();
            wx.showToast({ title: '已恢复上次草稿', icon: 'none', duration: 1500 });
          }
        }
      } catch (e) { /* 草稿损坏直接忽略 */ }
    }
    // 从 tabBar 语音转写结果读取
    if (app.globalData._pendingSmartText) {
      this.setData({ smartText: app.globalData._pendingSmartText });
      app.globalData._pendingSmartText = '';
    }
    if (app.globalData._pendingAddData) {
      var r = app.globalData._pendingAddData;
      this.setData({
        type: r.type || 'pickup',
        typeIndex: this.typeIndexOf(r.type),
        form: { station: r.station || '', code: r.code || '', company: r.company || '', trackingNo: r.trackingNo || '', note: r.note || '', institution: r.institution || '', amount: r.amount ? String(r.amount) : '' },
        dueDateStr: r.dueDate || '',
        isPrivate: !!r.isPrivate,
        impIndex: ['high', 'medium', 'low'].indexOf(r.importance || 'medium'),
        urgIndex: ['urgent', 'normal'].indexOf(r.urgency || 'normal')
      });
      this.updateMoreFilled();
      app.globalData._pendingAddData = null;
    }
    if (opts && opts.id) {
      var pkg = (app.globalData.packages || []).find(function (p) { return p.id === opts.id; });
      if (pkg) {
        var d = new Date(pkg.arrivedAt || Date.now());
        this.setData({
          editId: pkg.id,
          editTitle: pkg.code || '',
          type: pkg.type || 'pickup',
          typeIndex: this.typeIndexOf(pkg.type),
          form: { station: pkg.station || '', code: pkg.code || '', company: pkg.company || '', trackingNo: pkg.trackingNo || '', note: pkg.note || '', institution: pkg.institution || '', amount: pkg.amount ? String(pkg.amount) : '' },
          dueDateStr: pkg.dueDate || '',
          isPrivate: !!pkg.isPrivate,
          dateStr: pkg.arrivedAt ? d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2) : today(),
          timeStr: pkg.arrivedAt ? ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) : nowTime(),
          memberIndex: this.findMemberIndex(pkg.owner),
          assigneeIndex: this.findMemberIndex(pkg.assignee),
          assignerIndex: this.findMemberIndex(pkg.assigner),
          impIndex: ['high', 'medium', 'low'].indexOf(pkg.importance || 'medium'),
          urgIndex: ['urgent', 'normal'].indexOf(pkg.urgency || 'normal'),
          pillInfo: this.normalizePillForm(pkg.pillInfo)
        });
        this.refreshPillPreview();
        // 编辑模式：用药类型回填服药次数/时间 + 服药频率
        if (pkg.type === 'medication' && pkg.schedule && Array.isArray(pkg.schedule.times) && pkg.schedule.times.length) {
          this.setData({ medTimes: pkg.schedule.times, doseIndex: Math.min(3, pkg.schedule.times.length - 1) });
          var sf = pkg.schedule.freq || 'daily';
          var fi = 0;
          if (sf === 'interval') fi = (parseInt(pkg.schedule.intervalDays, 10) || 2) === 3 ? 2 : 1;
          else if (sf === 'weekly') fi = 3;
          this.setData({ freqIndex: fi, showWeekChips: !!FREQ_MAP[fi] && FREQ_MAP[fi].freq === 'weekly', pillBoardOpen: true, selWeekdays: sf === 'weekly' && Array.isArray(pkg.schedule.weekdays) && pkg.schedule.weekdays.length ? pkg.schedule.weekdays.slice() : [1, 3, 5] });
          this.syncWeekChips();
        }
        // 编辑模式：折叠区有非默认值时自动展开并标记已填写
        var hasMore = this.data.memberIndex > 0 || this.data.assigneeIndex > 0 ||
          this.data.assignerIndex > 0 || (pkg.note || '') !== '' ||
          this.data.impIndex !== 1 || this.data.urgIndex !== 1 || !!pkg.isPrivate;
        this.setData({ showMore: hasMore, moreFilled: hasMore });
      }
    }
  },

  findMemberIndex: function (name) {
    if (!name) return 0;
    var members = (app.globalData.members || []).map(function (m) { return m.name; });
    var idx = members.indexOf(name);
    return idx >= 0 ? idx + 1 : 0;
  },

  normalizePillForm: function (pi) {
    var dft = { color: 'white', shape: 'round', rows: 2, cols: 5, boards: 2, boardNo: 1 };
    if (!pi || typeof pi !== 'object') return dft;
    var clamp = function (v, min, max, d) { var n = parseInt(v, 10); return isNaN(n) ? d : Math.max(min, Math.min(max, n)); };
    return {
      color: this.data.pillColorOptions.indexOf(pi.color) >= 0 ? pi.color : dft.color,
      shape: this.data.pillShapeOptions.some(function (s) { return s.value === pi.shape; }) ? pi.shape : dft.shape,
      rows: clamp(pi.rows, 1, 4, 2),
      cols: clamp(pi.cols, 1, 8, 5),
      boards: clamp(pi.boards, 1, 6, 2),
      boardNo: clamp(pi.boardNo, 1, clamp(pi.boards, 1, 6, 2), 1)
    };
  },

  typeIndexOf: function (type) {
    return type === 'todo' ? 1 : (type === 'debt' ? 2 : (type === 'medication' ? 3 : 0));
  },
  onTypeChange: function (e) {
    var i = parseInt(e.detail.value, 10);
    var typeMap = { 0: 'pickup', 1: 'todo', 2: 'debt', 3: 'medication' };
    this.setData({ typeIndex: i, type: typeMap[i] || 'pickup' });
  },
  onTypeTap: function (e) {
    var type = e.currentTarget.dataset.type;
    var typeMap = { pickup: 0, todo: 1, debt: 2, medication: 3 };
    if (type === this.data.type) return;
    this.setData({ type: type, typeIndex: typeMap[type] || 0 });
  },
  onDoseChange: function (e) {
    var idx = parseInt(e.detail.value, 10);
    var defaults = [['08:00'], ['08:00', '20:00'], ['08:00', '13:00', '20:00'], ['08:00', '12:00', '18:00', '22:00']];
    this.setData({ doseIndex: idx, medTimes: defaults[idx] || ['08:00', '20:00'] });
  },
  onFreqChange: function (e) {
    this.setData({ freqIndex: parseInt(e.detail.value, 10), showWeekChips: !!FREQ_MAP[parseInt(e.detail.value, 10)] && FREQ_MAP[parseInt(e.detail.value, 10)].freq === 'weekly' });
  },
  onWeekChipTap: function (e) {
    var v = parseInt(e.currentTarget.dataset.v, 10);
    var sel = this.data.selWeekdays.slice();
    var i = sel.indexOf(v);
    if (i >= 0) {
      if (sel.length <= 1) { wx.showToast({ title: '至少保留一天', icon: 'none' }); return; }
      sel.splice(i, 1);
    } else {
      sel.push(v);
    }
    this.setData({ selWeekdays: sel.sort() });
    this.syncWeekChips();
  },

  syncWeekChips: function () {
    var sel = this.data.selWeekdays;
    var chips = this.data.weekChips.map(function (c) {
      return { v: c.v, l: c.l, sel: sel.indexOf(c.v) >= 0 };
    });
    this.setData({ weekChips: chips });
  },
  onMedTimeChange: function (e) {
    var idx = parseInt(e.currentTarget.dataset.idx, 10);
    var times = this.data.medTimes.slice();
    times[idx] = e.detail.value;
    this.setData({ medTimes: times });
  },
  // 药板实时预览：根据 pillInfo 计算预览网格与药丸内联样式（列数多时自动缩小防重叠）
  refreshPillPreview: function () {
    var pi = this.data.pillInfo;
    var hex = this.data.pillColorHex[pi.color] || '#F1F5F9';
    var dims = { round: [88, 88], oval: [108, 68], capsule: [120, 54], square: [88, 88] }[pi.shape] || [88, 88];
    var cellW = Math.floor(620 / Math.max(pi.cols, 1));
    var maxW = Math.floor(cellW * 0.8);
    var w = Math.min(dims[0], maxW);
    var h = Math.min(dims[1], Math.max(Math.floor(cellW * 0.55), 34));
    var r = pi.shape === 'square' ? Math.round(h * 0.16) : (pi.shape === 'round' ? 999 : Math.round(h / 2));
    var rows = [];
    for (var i = 0; i < pi.rows; i++) {
      var row = [];
      for (var j = 0; j < pi.cols; j++) row.push(j);
      rows.push(row);
    }
    this.setData({
      pillPreviewRows: rows,
      pillPrevStyle: 'width:' + w + 'rpx;height:' + h + 'rpx;border-radius:' + r + 'rpx;background:' + hex + ';'
    });
  },

  onPillColorTap: function (e) {
    this.setData({ 'pillInfo.color': e.currentTarget.dataset.color });
    this.refreshPillPreview();
  },
  onPillShapeTap: function (e) {
    this.setData({ 'pillInfo.shape': e.currentTarget.dataset.shape });
    this.refreshPillPreview();
  },
  onPillStep: function (e) {
    var field = e.currentTarget.dataset.field;
    var delta = parseInt(e.currentTarget.dataset.delta, 10);
    var limits = { rows: [1, 4], cols: [1, 8], boards: [1, 6] };
    var lim = limits[field] || [1, 8];
    var cur = this.data.pillInfo[field] || 1;
    var next = Math.max(lim[0], Math.min(lim[1], cur + delta));
    if (next === cur) return;
    var patch = {};
    patch['pillInfo.' + field] = next;
    this.setData(patch);
    this.refreshPillPreview();
  },
  onToggleMore: function () {
    if (this.data.showMore) this.updateMoreFilled(); // 收起时刷新徽标
    this.setData({ showMore: !this.data.showMore });
  },
  // 折叠区是否有非默认值（用于「已填写」徽标）
  updateMoreFilled: function () {
    var d = this.data;
    var filled = d.memberIndex > 0 || d.assigneeIndex > 0 || d.assignerIndex > 0 ||
      (d.form.note || '') !== '' || d.impIndex !== 1 || d.urgIndex !== 1 || d.isPrivate;
    this.setData({ moreFilled: !!filled });
  },
  onPrivateChange: function (e) {
    this.setData({ isPrivate: e.detail.value });
  },
  onField: function (e) {
    var f = e.currentTarget.dataset.field;
    var v = e.detail.value;
    this.setData({ ['form.' + f]: v });
  },

  // —— 快捷输入：历史驿站 / 常用快递 / 常用备注（点击 chip 直填）——
  loadHistory: function (key) {
    try {
      var v = wx.getStorageSync(key);
      var arr = typeof v === 'string' ? JSON.parse(v) : (Array.isArray(v) ? v : []);
      return Array.isArray(arr) ? arr.slice(0, 8) : [];
    } catch (e) { return []; }
  },
  saveHistory: function (key, arr) {
    try { wx.setStorageSync(key, JSON.stringify(arr.slice(0, 8))); } catch (e) { /* 存储失败忽略 */ }
  },
  // 保存成功后记入历史（最新在前去重），并刷新 chips
  pushHistory: function (field, val) {
    var v = (val || '').trim();
    if (!v) return;
    var key = HIST_KEYS[field];
    if (!key) return;
    var arr = this.loadHistory(key).filter(function (x) { return x !== v; });
    arr.unshift(v);
    this.saveHistory(key, arr);
  },
  refreshQuickChips: function () {
    var seen = {};
    var couriers = this.loadHistory(HIST_KEYS.company).concat(BUILTIN_COURIERS)
      .filter(function (c) { if (seen[c]) return false; seen[c] = 1; return true; }).slice(0, 10);
    var seenN = {};
    var notes = this.loadHistory(HIST_KEYS.note).concat(BUILTIN_NOTES)
      .filter(function (c) { if (seenN[c]) return false; seenN[c] = 1; return true; }).slice(0, 8);
    this.setData({ courierChips: couriers, noteChips: notes, stationChips: this.loadHistory(HIST_KEYS.station) });
  },
  onChipField: function (e) {
    var f = e.currentTarget.dataset.field;
    var v = e.currentTarget.dataset.val;
    if (!f || !v) return;
    this.setData({ ['form.' + f]: v });
  },

  // —— 药名输入联想（medication）——
  onMedNameInput: function (e) {
    var v = e.detail.value;
    this.setData({ 'form.code': v });
    var that = this;
    if (this._suggestTimer) clearTimeout(this._suggestTimer);
    if (!v || !v.trim()) {
      this.setData({ showDrugSuggest: false, drugSuggests: [], suggestEmpty: false });
      return;
    }
    this._suggestTimer = setTimeout(function () {
      api.suggestDrugs(v.trim(), function (res) {
        var items = (res && res.items) || [];
        // 有候选显示候选；无候选显示空态提示（证明联想链路已通，方便区分"功能没生效"与"词库无此药"）
        that.setData({ showDrugSuggest: true, drugSuggests: items, suggestEmpty: items.length === 0 });
      }, function () {
        that.setData({ showDrugSuggest: false, drugSuggests: [], suggestEmpty: false });
      });
    }, 300);
  },

  // 点击联想项：填入药名并搜索形态
  onDrugSuggestTap: function (e) {
    var name = e.currentTarget.dataset.name;
    this.setData({ 'form.code': name, showDrugSuggest: false, drugSuggests: [], suggestEmpty: false });
    this.lookupDrugAppearance(name);
  },

  // 手动触发形态搜索（输入完整药名后点「搜形态」）
  onDrugSearchTap: function () {
    var name = (this.data.form.code || '').trim();
    if (!name) { wx.showToast({ title: '请先输入药名', icon: 'none' }); return; }
    this.lookupDrugAppearance(name);
  },

  // 搜索药品形态：本地知识库优先（AI 兜底），单候选直填，多候选让用户选
  lookupDrugAppearance: function (name) {
    var that = this;
    wx.showLoading({ title: '搜索形态...', mask: true });
    api.searchDrugs(name, function (res) {
      wx.hideLoading();
      var items = (res && res.items) || [];
      var source = (res && res.source) || 'none';
      if (!items.length) {
        wx.showToast({ title: (res && res.hint) || '未收录，请手动设置药板', icon: 'none' });
        return;
      }
      if (items.length === 1) {
        that.applyDrugAppearance(items[0], source);
        return;
      }
      var SHAPE_CN = { round: '圆形', oval: '椭圆', capsule: '胶囊', square: '方形' };
      var labels = items.slice(0, 6).map(function (d) {
        return (d.name || '') + '：' + SHAPE_CN[d.shape] + ' ' + d.rows + '×' + d.cols + ' 一盒' + d.boards + '板';
      });
      wx.showActionSheet({
        itemList: labels,
        success: function (r) {
          if (r.tapIndex >= 0 && r.tapIndex < Math.min(items.length, 6)) {
            that.applyDrugAppearance(items[r.tapIndex], source);
          }
        }
      });
    }, function () { wx.hideLoading(); });
  },

  // 应用药品形态：回填仿真药板（颜色/形状/行列/板数），并展开药板设置方便核对
  applyDrugAppearance: function (d, source) {
    this.setData({ pillInfo: this.normalizePillForm(d), pillBoardOpen: true });
    this.refreshPillPreview();
    wx.showToast({ title: source === 'ai' ? 'AI 已生成药板·请核对' : '已生成仿真药板', icon: 'none' });
  },

  // 药板设置折叠/展开
  onTogglePillBoard: function () {
    this.setData({ pillBoardOpen: !this.data.pillBoardOpen });
  },

  onSmartText: function (e) { this.setData({ smartText: e.detail.value }); },
  onDateChange: function (e) { this.setData({ dateStr: e.detail.value }); },
  onTimeChange: function (e) { this.setData({ timeStr: e.detail.value }); },
  onMemberChange: function (e) { this.setData({ memberIndex: parseInt(e.detail.value, 10) }); },
  onAssigneeChange: function (e) { this.setData({ assigneeIndex: parseInt(e.detail.value, 10) }); },
  onAssignerChange: function (e) { this.setData({ assignerIndex: parseInt(e.detail.value, 10) }); },
  onImpChange: function (e) { this.setData({ impIndex: parseInt(e.detail.value, 10) }); },
  onUrgChange: function (e) { this.setData({ urgIndex: parseInt(e.detail.value, 10) }); },
  onDueDateChange: function (e) { this.setData({ dueDateStr: e.detail.value }); },

  // 应用用药解析结果（文本/药板照片共用）：类型、药名、服药人、计划时间、药板
  applyMedicationRecord: function (r) {
    var patch = {
      type: 'medication',
      typeIndex: 3,
      isPrivate: true,
      form: Object.assign({}, this.data.form, { code: r.code || '', note: r.note || '' })
    };
    if (r.owner) patch.memberIndex = this.findMemberIndex(r.owner);
    if (r.pillInfo) { patch.pillInfo = this.normalizePillForm(r.pillInfo); patch.pillBoardOpen = true; }
    this.setData(patch);
    if (r.pillInfo) this.refreshPillPreview();
    var times = r.schedule && Array.isArray(r.schedule.times) && r.schedule.times.length ? r.schedule.times : null;
    if (times) {
      this.setData({ medTimes: times, doseIndex: Math.min(3, times.length - 1) });
    }
  },

  // 拍药板照片识别版式（M3：拍照 → 视觉模型 → pillInfo 预填）
  onPillPhoto: function () {
    var that = this;
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: function (res) {
        var path = res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath;
        if (!path) return;
        wx.showLoading({ title: '识别中...' });
        wx.compressImage({
          src: path,
          quality: 70,
          success: function (c) { that.readAndParsePillPhoto(c.tempFilePath); },
          fail: function () { that.readAndParsePillPhoto(path); }
        });
      }
    });
  },

  readAndParsePillPhoto: function (path) {
    var that = this;
    var fs = wx.getFileSystemManager();
    fs.readFile({
      filePath: path,
      encoding: 'base64',
      success: function (res) {
        var dataUrl = 'data:image/jpeg;base64,' + res.data;
        api.parseImage([dataUrl], 'medication', function (data) {
          wx.hideLoading();
          if (data.fallback || !data.records || !data.records.length) {
            wx.showToast({ title: '未能识别药板，请手动设置', icon: 'none' });
            return;
          }
          that.applyMedicationRecord(data.records[0]);
          wx.showToast({ title: '已识别药板', icon: 'success' });
        }, function () {
          wx.hideLoading();
          wx.showToast({ title: '识别失败，请手动设置', icon: 'none' });
        });
      },
      fail: function () {
        wx.hideLoading();
        wx.showToast({ title: '读取图片失败', icon: 'none' });
      }
    });
  },

  onSmartParse: function () {
    var text = this.data.smartText.trim();
    if (!text) { wx.showToast({ title: '请输入文本', icon: 'none' }); return; }
    var that = this;
    wx.showLoading({ title: '识别中...' });
    api.parse(text, 'auto', function (data) {
      wx.hideLoading();
      var records = data.records || [];
      if (records.length > 1) {
        // 多条，批量导入
        api.addPackages(records, function () {
          wx.showToast({ title: '已导入 ' + records.length + ' 条', icon: 'success' });
          setTimeout(function () { wx.navigateBack(); }, 800);
        });
        return;
      }
      if (records.length === 1) {
        var r = records[0];
        var d = new Date(r.arrivedAt || Date.now());
        that.setData({
          type: r.type || 'pickup',
          typeIndex: that.typeIndexOf(r.type || 'pickup'),
          form: { station: r.station || '', code: r.code || '', company: r.company || '', trackingNo: r.trackingNo || '', note: r.note || '', institution: r.institution || '', amount: r.amount ? String(r.amount) : '' },
          dueDateStr: r.dueDate || '',
          isPrivate: r.type === 'debt' || r.type === 'medication' ? true : false,
          dateStr: r.arrivedAt ? d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2) : today(),
          timeStr: r.arrivedAt ? ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) : nowTime(),
          impIndex: ['high', 'medium', 'low'].indexOf(r.importance || 'medium'),
          urgIndex: ['urgent', 'normal'].indexOf(r.urgency || 'normal')
        });
        if (r.type === 'medication') that.applyMedicationRecord(r);
        wx.showToast({ title: '已识别', icon: 'success' });
      } else {
        wx.showToast({ title: '未识别到内容', icon: 'none' });
      }
    }, function () { wx.hideLoading(); });
  },

  onChooseImage: function () {
    var that = this;
    wx.chooseImage({
      count: 3,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: function (res) {
        var paths = res.tempFilePaths;
        var current = that.data.imageTempPaths;
        var combined = current.concat(paths);
        that.setData({ imageTempPaths: combined });
        that.loadImagesAsBase64(combined);
      }
    });
  },

  loadImagesAsBase64: function (paths) {
    var that = this;
    var fs = wx.getFileSystemManager();
    var base64List = [];
    var loaded = 0;
    var total = paths.length;
    paths.forEach(function (path) {
      // 先压缩图片再读 base64，减少内存占用和传输体积
      wx.compressImage({
        src: path,
        quality: 80,
        success: function (compRes) {
          fs.readFile({
            filePath: compRes.tempFilePath,
            encoding: 'base64',
            success: function (res) {
              base64List.push('data:image/jpeg;base64,' + res.data);
              loaded++;
              if (loaded === total) that.setData({ imageBase64List: base64List });
            },
            fail: function () {
              loaded++;
              if (loaded === total) that.setData({ imageBase64List: base64List });
            }
          });
        },
        fail: function () {
          // 压缩失败，降级读原图
          fs.readFile({
            filePath: path,
            encoding: 'base64',
            success: function (res) {
              var ext = path.match(/\.(\w+)$/);
              var mime = ext && ext[1] === 'jpg' ? 'image/jpeg' : 'image/png';
              base64List.push('data:' + mime + ';base64,' + res.data);
              loaded++;
              if (loaded === total) that.setData({ imageBase64List: base64List });
            },
            fail: function () {
              loaded++;
              if (loaded === total) that.setData({ imageBase64List: base64List });
            }
          });
        }
      });
    });
  },

  onRemoveImage: function (e) {
    var idx = e.currentTarget.dataset.idx;
    var paths = this.data.imageTempPaths.slice();
    var b64s = this.data.imageBase64List.slice();
    paths.splice(idx, 1);
    b64s.splice(idx, 1);
    this.setData({ imageTempPaths: paths, imageBase64List: b64s });
  },

  onParseImage: function () {
    var that = this;
    if (!this.data.imageBase64List.length) {
      wx.showToast({ title: '请先选择图片', icon: 'none' });
      return;
    }
    this.setData({ imageParsing: true });
    wx.showLoading({ title: '识别中...' });
    api.parseImage(this.data.imageBase64List, 'auto', function (data) {
      wx.hideLoading();
      that.setData({ imageParsing: false });
      if (data.fallback) {
        wx.showToast({ title: '图片识别暂不可用，请尝试文本', icon: 'none' });
        return;
      }
      var records = data.records || [];
      if (records.length === 0) {
        wx.showToast({ title: '未识别到内容', icon: 'none' });
        return;
      }
      if (records.length > 1) {
        api.addPackages(records, function () {
          wx.showToast({ title: '已导入 ' + records.length + ' 条', icon: 'success' });
          setTimeout(function () { wx.navigateBack(); }, 800);
        });
        return;
      }
      var r = records[0];
      var d = new Date(r.arrivedAt || Date.now());
      that.setData({
        type: r.type || 'pickup',
        typeIndex: this.typeIndexOf(r.type || 'pickup'),
        form: { station: r.station || '', code: r.code || '', company: r.company || '', trackingNo: r.trackingNo || '', note: r.note || '', institution: r.institution || '', amount: r.amount ? String(r.amount) : '' },
      dueDateStr: r.dueDate || '',
        isPrivate: r.type === 'debt' || r.type === 'medication' ? true : false,
        dateStr: r.arrivedAt ? d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2) : today(),
        timeStr: r.arrivedAt ? ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) : nowTime(),
        impIndex: ['high', 'medium', 'low'].indexOf(r.importance || 'medium'),
        urgIndex: ['urgent', 'normal'].indexOf(r.urgency || 'normal')
      });
      if (r.type === 'medication') that.applyMedicationRecord(r);
      wx.showToast({ title: '已识别', icon: 'success' });
    }, function () {
      wx.hideLoading();
      that.setData({ imageParsing: false });
    });
  },

  onSave: function () {
    this.updateMoreFilled();
    var f = this.data.form;
    if (this.data.type === 'pickup' && (!f.station || !f.code)) {
      wx.showToast({ title: '驿站和取件码必填', icon: 'none' }); return;
    }
    if (this.data.type === 'todo' && !f.code) {
      wx.showToast({ title: '备忘内容必填', icon: 'none' }); return;
    }
    if (this.data.type === 'medication' && !f.code) {
      wx.showToast({ title: '药品名称必填', icon: 'none' }); return;
    }
    var that = this;
    var arrivedAt = this.data.dateStr + 'T' + this.data.timeStr;
    var memberName = this.data.memberOptions[this.data.memberIndex];
    var data = {
      type: this.data.type,
      station: f.station || '',
      code: f.code || '',
      company: f.company || '',
      trackingNo: f.trackingNo || '',
      arrivedAt: arrivedAt,
      owner: this.data.memberIndex === 0 ? '' : memberName,
      assignee: this.data.assigneeIndex === 0 ? '' : this.data.memberOptions[this.data.assigneeIndex],
      assigner: this.data.assignerIndex === 0 ? '' : this.data.memberOptions[this.data.assignerIndex],
      note: f.note || '',
      importance: ['high', 'medium', 'low'][this.data.impIndex] || 'medium',
      urgency: ['urgent', 'normal'][this.data.urgIndex] || 'normal',
      institution: f.institution || '',
      amount: f.amount ? parseFloat(f.amount) : 0,
      dueDate: this.data.dueDateStr || '',
      isPrivate: this.data.isPrivate
    };
    if (this.data.type === 'medication') {
      var fm = FREQ_MAP[this.data.freqIndex] || FREQ_MAP[0];
      var sched = { times: this.data.medTimes, active: true };
      if (fm.freq === 'interval') { sched.freq = 'interval'; sched.intervalDays = fm.intervalDays; }
      else if (fm.freq === 'weekly') {
        if (this.data.selWeekdays.length) { sched.freq = 'weekly'; sched.weekdays = this.data.selWeekdays; }
      }
      data.schedule = sched;
      data.pillInfo = this.data.pillInfo;
    }
    wx.showLoading({ title: '保存中...' });
    var selfRef = this;
    var afterSaved = function () {
      // 快捷输入历史：驿站/快递公司/备注记入本地，下次一键回填
      selfRef.pushHistory('station', f.station);
      selfRef.pushHistory('company', f.company);
      selfRef.pushHistory('note', f.note);
    };
    if (this.data.editId) {
      api.updatePackage(this.data.editId, data, function () {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        afterSaved();
        that.clearDraft();
        // 用药记录保存后顺带请求订阅授权（勾选"总是保持"后静默续配额）
        if (that.data.type === 'medication') subscribe.askSubscribe();
        setTimeout(function () { wx.navigateBack(); }, 600);
      }, function () {
        wx.hideLoading();
      });
    } else {
      api.addPackages([data], function () {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        afterSaved();
        that.clearDraft();
        if (that.data.type === 'medication') subscribe.askSubscribe();
        setTimeout(function () { wx.navigateBack(); }, 600);
      }, function () {
        wx.hideLoading();
      });
    }
  },

  // ── 草稿暂存：onHide 自动保存，onLoad 恢复，保存成功清除 ──
  saveDraft: function () {
    if (this.data.editId) return; // 编辑模式不存草稿
    var d = this.data;
    try {
      wx.setStorageSync('fph_add_draft_v1', JSON.stringify({
        type: d.type, typeIndex: d.typeIndex, form: d.form,
        dueDateStr: d.dueDateStr, medTimes: d.medTimes, doseIndex: d.doseIndex,
        freqIndex: d.freqIndex, selWeekdays: d.selWeekdays, pillInfo: d.pillInfo,
        isPrivate: d.isPrivate, impIndex: d.impIndex, urgIndex: d.urgIndex,
        memberIndex: d.memberIndex, assigneeIndex: d.assigneeIndex, ts: Date.now()
      }));
    } catch (e) { /* 存储失败忽略 */ }
  },
  clearDraft: function () {
    try { wx.removeStorageSync('fph_add_draft_v1'); } catch (e) { /* noop */ }
  },
  onHide: function () {
    this.saveDraft();
  },

  onDelete: function () {
    var that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定删除这条记录？',
      success: function (res) {
        if (res.confirm) {
          api.deletePackage(that.data.editId, function () {
            wx.showToast({ title: '已删除', icon: 'success' });
            setTimeout(function () { wx.navigateBack(); }, 600);
          });
        }
      }
    });
  }
});
