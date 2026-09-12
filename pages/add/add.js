// pages/add/add.js
var api = require('../../utils/api');
var app = getApp();

function today() { var d = new Date(); return d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2); }
function nowTime() { var d = new Date(); return ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2); }

Page({
  data: {
    editId: '',
    editTitle: '',
    type: 'pickup',
    typeIndex: 0,
    typeOptions: ['📦 取件码', '📝 文本备忘'],
    form: { station: '', code: '', company: '', trackingNo: '', note: '' },
    smartText: '',
    imageTempPaths: [],
    imageBase64List: [],
    imageParsing: false,
    dateStr: today(),
    timeStr: nowTime(),
    endDate: '2099-12-31',
    memberOptions: ['不指定'],
    memberIndex: 0,
    impOptions: ['🔴 高', '🟡 中', '⚪ 低'],
    impIndex: 1,
    urgOptions: ['⚡ 紧急', '🕐 普通'],
    urgIndex: 1
  },

  onLoad: function (opts) {
    api.setToken(app.globalData.token);
    var members = (app.globalData.members || []).map(function (m) { return m.name; });
    this.setData({ memberOptions: ['不指定'].concat(members) });
    if (opts && opts.id) {
      var pkg = (app.globalData.packages || []).find(function (p) { return p.id === opts.id; });
      if (pkg) {
        var d = new Date(pkg.arrivedAt || Date.now());
        this.setData({
          editId: pkg.id,
          editTitle: pkg.code || '',
          type: pkg.type || 'pickup',
          typeIndex: pkg.type === 'todo' ? 1 : 0,
          form: { station: pkg.station || '', code: pkg.code || '', company: pkg.company || '', trackingNo: pkg.trackingNo || '', note: pkg.note || '' },
          dateStr: pkg.arrivedAt ? d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2) : today(),
          timeStr: pkg.arrivedAt ? ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) : nowTime(),
          memberIndex: this.findMemberIndex(pkg.owner),
          impIndex: ['high', 'medium', 'low'].indexOf(pkg.importance || 'medium'),
          urgIndex: ['urgent', 'normal'].indexOf(pkg.urgency || 'normal')
        });
      }
    }
  },

  findMemberIndex: function (name) {
    if (!name) return 0;
    var members = (app.globalData.members || []).map(function (m) { return m.name; });
    var idx = members.indexOf(name);
    return idx >= 0 ? idx + 1 : 0;
  },

  onTypeChange: function (e) {
    var i = parseInt(e.detail.value, 10);
    this.setData({ typeIndex: i, type: i === 1 ? 'todo' : 'pickup' });
  },
  onField: function (e) {
    var f = e.currentTarget.dataset.field;
    var v = e.detail.value;
    this.setData({ ['form.' + f]: v });
  },
  onSmartText: function (e) { this.setData({ smartText: e.detail.value }); },
  onDateChange: function (e) { this.setData({ dateStr: e.detail.value }); },
  onTimeChange: function (e) { this.setData({ timeStr: e.detail.value }); },
  onMemberChange: function (e) { this.setData({ memberIndex: parseInt(e.detail.value, 10) }); },
  onImpChange: function (e) { this.setData({ impIndex: parseInt(e.detail.value, 10) }); },
  onUrgChange: function (e) { this.setData({ urgIndex: parseInt(e.detail.value, 10) }); },

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
          typeIndex: (r.type === 'todo') ? 1 : 0,
          form: { station: r.station || '', code: r.code || '', company: r.company || '', trackingNo: r.trackingNo || '', note: r.note || '' },
          dateStr: r.arrivedAt ? d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2) : today(),
          timeStr: r.arrivedAt ? ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) : nowTime(),
          impIndex: ['high', 'medium', 'low'].indexOf(r.importance || 'medium'),
          urgIndex: ['urgent', 'normal'].indexOf(r.urgency || 'normal')
        });
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
      fs.readFile({
        filePath: path,
        encoding: 'base64',
        success: function (res) {
          var ext = path.match(/\.(\w+)$/);
          var mime = ext && ext[1] === 'jpg' ? 'image/jpeg' : 'image/png';
          base64List.push('data:' + mime + ';base64,' + res.data);
          loaded++;
          if (loaded === total) {
            that.setData({ imageBase64List: base64List });
          }
        },
        fail: function () {
          loaded++;
          if (loaded === total) {
            that.setData({ imageBase64List: base64List });
          }
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
        typeIndex: (r.type === 'todo') ? 1 : 0,
        form: { station: r.station || '', code: r.code || '', company: r.company || '', trackingNo: r.trackingNo || '', note: r.note || '' },
        dateStr: r.arrivedAt ? d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2) : today(),
        timeStr: r.arrivedAt ? ('0'+d.getHours()).slice(-2) + ':' + ('0'+d.getMinutes()).slice(-2) : nowTime(),
        impIndex: ['high', 'medium', 'low'].indexOf(r.importance || 'medium'),
        urgIndex: ['urgent', 'normal'].indexOf(r.urgency || 'normal')
      });
      wx.showToast({ title: '已识别', icon: 'success' });
    }, function () {
      wx.hideLoading();
      that.setData({ imageParsing: false });
    });
  },

  onSave: function () {
    var f = this.data.form;
    if (this.data.type === 'pickup' && (!f.station || !f.code)) {
      wx.showToast({ title: '驿站和取件码必填', icon: 'none' }); return;
    }
    if (this.data.type === 'todo' && !f.code) {
      wx.showToast({ title: '备忘内容必填', icon: 'none' }); return;
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
      note: f.note || '',
      importance: ['high', 'medium', 'low'][this.data.impIndex] || 'medium',
      urgency: ['urgent', 'normal'][this.data.urgIndex] || 'normal'
    };
    wx.showLoading({ title: '保存中...' });
    if (this.data.editId) {
      api.updatePackage(this.data.editId, data, function () {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(function () { wx.navigateBack(); }, 600);
      }, function () {
        wx.hideLoading();
      });
    } else {
      api.addPackages([data], function () {
        wx.hideLoading();
        wx.showToast({ title: '已保存', icon: 'success' });
        setTimeout(function () { wx.navigateBack(); }, 600);
      }, function () {
        wx.hideLoading();
      });
    }
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
