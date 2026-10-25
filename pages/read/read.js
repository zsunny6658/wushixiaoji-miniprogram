// pages/read/read.js - 待读（个人知识库）
// 设计要点：个人维度（服务端按 ownerId 隔离）、列表 + 混合检索、粘贴链接即抓取。
var api = require('../../utils/api');
var hl = require('../../utils/highlight');

var PAGE_SIZE = 20;

/** 时间标签：刚刚 / N分钟前 / 今天 HH:mm / 昨天 / M月D日 */
function timeLabel(iso) {
  if (!iso) return '';
  var t = Date.parse(iso);
  if (isNaN(t)) return '';
  var now = Date.now();
  var diff = now - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  var d = new Date(t);
  var n = new Date(now);
  var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  if (d.toDateString() === n.toDateString()) return '今天 ' + hm;
  var y = new Date(now - 86400000);
  if (d.toDateString() === y.toDateString()) return '昨天 ' + hm;
  return (d.getMonth() + 1) + '月' + d.getDate() + '日';
}

/** 列表项展示态：时间、抓取状态、是否已读 */
function decorateItems(list) {
  return (list || []).map(function (it) {
    var statusText = '';
    if (it.contentStatus === 'pending') statusText = '排队解析中';
    else if (it.contentStatus === 'fetching') statusText = '正在抓取正文';
    else if (it.contentStatus === 'failed') statusText = '解析失败';
    else if (it.contentStatus === 'partial') statusText = '仅获取到摘要';
    return Object.assign({}, it, {
      timeLabel: timeLabel(it.createdAt || it.addedAt),
      statusText: statusText,
      failed: it.contentStatus === 'failed',
      busy: it.contentStatus === 'pending' || it.contentStatus === 'fetching',
      unread: (it.readStatus || 'unread') === 'unread',
      tagsText: (it.tags || []).slice(0, 3)
    });
  });
}

Page({
  data: {
    items: [],
    displayItems: [],
    stats: { total: 0, unread: 0, reading: 0, done: 0, pending: 0, failed: 0 },
    filter: 'all',          // all | unread | done
    keyword: '',
    searchResults: null,    // 非空时为「搜索结果模式」
    searching: false,
    loading: true,
    loadingMore: false,
    hasMore: false,
    offset: 0,
    showAdd: false,
    addText: '',
    addNote: '',
    adding: false,
    tags: []
  },

  onShow: function () {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ active: 2 });
    }
    this.loadList(true);
    this.loadTags();
  },

  onHide: function () {
    this.clearPoll();
  },

  onUnload: function () {
    this.clearPoll();
  },

  /** 有「解析中」的条目时自动轮询刷新（最多 8 次，避免常驻定时器） */
  schedulePoll: function () {
    var that = this;
    var busy = (this.data.stats.pending || 0) > 0 ||
      this.data.items.some(function (i) { return i.busy; });
    if (!busy) { this.clearPoll(); return; }
    if (this._pollCount >= 8) { this.clearPoll(); return; }
    if (this._pollTimer) return;
    this._pollTimer = setTimeout(function () {
      that._pollTimer = null;
      that._pollCount = (that._pollCount || 0) + 1;
      that.loadList(true);
    }, 4000);
  },

  clearPoll: function () {
    if (this._pollTimer) {
      clearTimeout(this._pollTimer);
      this._pollTimer = null;
    }
    this._pollCount = 0;
  },

  onPullDownRefresh: function () {
    var that = this;
    this.loadList(true, function () {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom: function () {
    if (this.data.searchResults) return;
    if (!this.data.hasMore || this.data.loadingMore) return;
    this.loadList(false);
  },

  loadList: function (reset, done) {
    var that = this;
    var offset = reset ? 0 : this.data.offset;
    if (reset) this.setData({ loading: true });
    else this.setData({ loadingMore: true });

    api.readList(
      { status: this.data.filter, limit: PAGE_SIZE, offset: offset },
      function (data) {
        var incoming = decorateItems(data.items);
        var items = reset ? incoming : that.data.items.concat(incoming);
        that.setData({
          items: items,
          displayItems: that.data.searchResults ? that.data.searchResults : items,
          stats: data.stats || that.data.stats,
          offset: offset + (data.items || []).length,
          hasMore: !!data.hasMore,
          loading: false,
          loadingMore: false
        });
        that.schedulePoll();
        done && done();
      },
      function () {
        that.setData({ loading: false, loadingMore: false });
        done && done();
      }
    );
  },

  loadTags: function () {
    var that = this;
    api.readTags(function (data) {
      that.setData({ tags: (data.tags || []).slice(0, 8) });
    }, function () {});
  },

  /* ---------------- 筛选 ---------------- */
  onFilter: function (e) {
    var f = e.currentTarget.dataset.filter;
    if (f === this.data.filter) return;
    this.setData({ filter: f, items: [], displayItems: [], offset: 0, keyword: '', searchResults: null });
    this.loadList(true);
  },

  /* ---------------- 搜索 ---------------- */
  onSearchInput: function (e) {
    var kw = e.detail.value;
    this.setData({ keyword: kw });
    if (this._timer) clearTimeout(this._timer);
    var that = this;
    if (!kw.trim()) {
      this.setData({ searchResults: null, searching: false, displayItems: this.data.items });
      return;
    }
    this._timer = setTimeout(function () {
      that.doSearch(kw.trim());
    }, 320);
  },

  onSearchConfirm: function (e) {
    var kw = (e.detail.value || '').trim();
    if (kw) this.doSearch(kw);
  },

  doSearch: function (kw) {
    var that = this;
    this.setData({ searching: true });
    api.readSearch(kw, function (data) {
      var terms = hl.splitTerms(kw);
      var results = decorateItems(data.items).map(function (it) {
        if (it.snippet) {
          var s = hl.segs(it.snippet, terms);
          if (s) it.snippetSegs = s;
        }
        return it;
      });
      that._lastTerms = terms;
      that.setData({ searching: false, searchResults: results, displayItems: results });
    }, function () {
      that.setData({ searching: false });
    });
  },

  onClearSearch: function () {
    this.setData({ keyword: '', searchResults: null, searching: false, displayItems: this.data.items });
  },

  /* ---------------- 智能问答 ---------------- */
  onOpenAsk: function () {
    wx.navigateTo({ url: '/pages/read-ask/read-ask' });
  },

  /* ---------------- 添加 ---------------- */
  onOpenAdd: function () {
    var that = this;
    this.setData({ showAdd: true, addText: '', addNote: '' });
    // 顺手把剪贴板里的链接带进来（微信复制分享链接的高频路径）
    wx.getClipboardData({
      success: function (res) {
        var t = (res.data || '').trim();
        if (t && /https?:\/\//i.test(t) && !that.data.addText) {
          that.setData({ addText: t });
        }
      }
    });
  },

  onCloseAdd: function () {
    this.setData({ showAdd: false });
  },

  onAddTextInput: function (e) {
    this.setData({ addText: e.detail.value });
  },

  onAddNoteInput: function (e) {
    this.setData({ addNote: e.detail.value });
  },

  onConfirmAdd: function () {
    var that = this;
    var text = (this.data.addText || '').trim();
    if (!text) {
      wx.showToast({ title: '请粘贴链接', icon: 'none' });
      return;
    }
    if (!/https?:\/\//i.test(text)) {
      wx.showToast({ title: '没找到 http(s) 链接', icon: 'none' });
      return;
    }
    this.setData({ adding: true });
    api.readAdd(text, this.data.addNote, function (data) {
      that.setData({ adding: false, showAdd: false, addText: '', addNote: '' });
      if (data.duplicate) {
        wx.showToast({ title: '这条已经存过了', icon: 'none' });
      } else {
        wx.showToast({ title: '已加入，正在解析', icon: 'success' });
      }
      that.loadList(true);
    }, function () {
      that.setData({ adding: false });
    });
  },

  /* ---------------- 打开 / 重试 ---------------- */
  onOpenItem: function (e) {
    var id = e.currentTarget.dataset.id;
    var url = '/pages/read-detail/read-detail?id=' + id;
    // 搜索态带上关键词，详情页正文高亮命中片段
    if (this.data.searchResults && this.data.keyword.trim()) {
      url += '&q=' + encodeURIComponent(this.data.keyword.trim());
    }
    wx.navigateTo({ url: url });
  },

  onRetry: function (e) {
    var that = this;
    var id = e.currentTarget.dataset.id;
    api.readRefetch(id, function () {
      wx.showToast({ title: '重新解析中', icon: 'none' });
      that.loadList(true);
    }, function () {});
  },

  onCopyLink: function (e) {
    var url = e.currentTarget.dataset.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function () { wx.showToast({ title: '链接已复制', icon: 'success' }); }
    });
  },

  onTagTap: function (e) {
    var tag = e.currentTarget.dataset.tag;
    this.setData({ keyword: tag });
    this.doSearch(tag);
  },

  /* ---------------- 标签归并 ---------------- */
  onOrganizeTags: function () {
    var that = this;
    api.readTagSuggest(function (data) {
      var sug = data.suggestions || [];
      if (!sug.length) {
        wx.showToast({ title: '没发现可归并的重复标签', icon: 'none' });
        return;
      }
      var items = sug.map(function (s) {
        return '"' + s.from + '"(' + s.fromCount + ')\u2192"' + s.to + '"(' + s.toCount + ')';
      });
      wx.showActionSheet({
        itemList: items.slice(0, 6),
        success: function (r) {
          var s = sug[r.tapIndex];
          wx.showModal({
            title: '归并标签',
            content: '将 ' + s.fromCount + ' 篇的 #' + s.from + ' 改为 #' + s.to + '？',
            confirmText: '归并',
            success: function (m) {
              if (!m.confirm) return;
              api.readTagMerge(s.from, s.to, function (res) {
                wx.showToast({ title: '已归并 ' + (res.changed || 0) + ' 篇', icon: 'success' });
                that.loadTags();
                that.loadList(true);
              }, function () {
                wx.showToast({ title: '归并失败', icon: 'none' });
              });
            }
          });
        }
      });
    }, function () {
      wx.showToast({ title: '获取建议失败', icon: 'none' });
    });
  },

  /* ---------------- 索引诊断 ---------------- */
  onIndexInfo: function () {
    var that = this;
    api.readIndexStats(function (data) {
      var ix = data.index || {};
      var lines = [
        '已收录 ' + (ix.docs || 0) + ' 篇，索引就绪 ' + (ix.indexed || 0) + ' 篇',
        '分块 ' + (ix.chunks || 0) + ' 块，全文索引 ' + (ix.ftsRows || 0) + ' 行',
        '向量引擎 ' + (ix.engine || '-') + ' · ' + (ix.dim || 0) + ' 维'
      ].join('\n');
      wx.showModal({
        title: '检索索引',
        content: lines,
        confirmText: '重建',
        cancelText: '关闭',
        success: function (r) {
          if (!r.confirm) return;
          api.readIndexRebuild(function (res) {
            wx.showToast({ title: '已重建 ' + (res.rebuilt || 0) + ' 篇', icon: 'success' });
          }, function () {
            wx.showToast({ title: '重建失败', icon: 'none' });
          });
        }
      });
    }, function () {
      wx.showToast({ title: '获取索引状态失败', icon: 'none' });
    });
  },

  noop: function () {}
});
