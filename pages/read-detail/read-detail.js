// pages/read-detail/read-detail.js - 待读详情（摘要 + 正文原文）
var api = require('../../utils/api');
var hl = require('../../utils/highlight');

/**
 * 极简 Markdown → 块数组（小程序没有成熟的 md 渲染器，正文用块级样式呈现即可）
 * 支持：标题 / 段落 / 列表 / 引用 / 图片 / 代码块
 */
function parseMarkdown(md) {
  var lines = String(md || '').split('\n');
  var blocks = [];
  var inCode = false;
  var codeBuf = [];

  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i];
    var line = raw.trim();

    if (line.indexOf('```') === 0) {
      if (inCode) {
        blocks.push({ type: 'code', text: codeBuf.join('\n') });
        codeBuf = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    if (!line) continue;

    var img = line.match(/^!\[[^\]]*\]\(([^)]+)\)$/);
    if (img) { blocks.push({ type: 'img', src: img[1] }); continue; }

    var h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push({ type: 'h' + h[1].length, text: clean(h[2]) });
      continue;
    }
    if (line.indexOf('> ') === 0) {
      blocks.push({ type: 'quote', text: clean(line.slice(2)) });
      continue;
    }
    if (line.indexOf('- ') === 0 || line.indexOf('* ') === 0) {
      blocks.push({ type: 'li', text: clean(line.slice(2)) });
      continue;
    }
    if (line === '---') { blocks.push({ type: 'hr' }); continue; }
    blocks.push({ type: 'p', text: clean(line) });
  }
  if (codeBuf.length) blocks.push({ type: 'code', text: codeBuf.join('\n') });
  return blocks;
}

/** ISO → 2026-10-25 08:30 */
function formatTime(iso) {
  if (!iso) return '';
  var t = Date.parse(iso);
  if (isNaN(t)) return String(iso).slice(0, 16).replace('T', ' ');
  var d = new Date(t);
  function p(n) { return ('0' + n).slice(-2); }
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

/** 去掉行内 md 标记（**加粗**、`code`、[文字](url)） */
function clean(s) {
  return String(s || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

/** 命中的文本块 → 段数组（用于嵌套 <text> 高亮渲染）；无命中返回原样 */
function markBlock(b, terms) {
  if (!terms || !terms.length || !b || !b.text) return b;
  var s = hl.segs(b.text, terms);
  if (s) {
    b.segs = s;
    b.hit = true;
  }
  return b;
}

Page({
  data: {
    id: '',
    item: null,
    blocks: [],
    loading: true,
    contentLoading: true,
    contentEmpty: false,
    showAll: false,
    headBlocks: [],
    restBlocks: [],
    hlTerms: [],       // 检索态进入时的高亮词
    headHitIdx: -1,    // 第一个命中块在 headBlocks 里的下标
    restHitIdx: -1,    // 第一个命中块在 restBlocks 里的下标
    editingTags: false,
    newTag: '',
    relatedItems: []
  },

  onLoad: function (options) {
    var terms = hl.splitTerms(decodeURIComponent(options.q || ''));
    this.setData({ id: options.id || '', hlTerms: terms });
    this.loadDetail();
  },

  onPullDownRefresh: function () {
    var that = this;
    this.loadDetail(function () { wx.stopPullDownRefresh(); });
  },

  loadDetail: function (done) {
    var that = this;
    api.readDetail(this.data.id, function (data) {
      var item = data.item || {};
      item.createdLabel = formatTime(item.createdAt);
      that.setData({
        item: item,
        loading: false,
        contentLoading: item.contentStatus !== 'failed'
      });
      wx.setNavigationBarTitle({ title: item.platformLabel || '阅读' });
      that.loadContent();
      that.loadRelated();
      done && done();
    }, function () {
      that.setData({ loading: false });
      done && done();
    });
  },

  loadContent: function () {
    var that = this;
    var terms = this.data.hlTerms;
    api.readContent(this.data.id, function (data) {
      var blocks = parseMarkdown(data.content || '');
      if (terms.length) blocks = blocks.map(function (b) { return markBlock(b, terms); });
      var head = [];
      var rest = blocks;
      var firstHitId = '';
      var headHitIdx = -1;
      var restHitIdx = -1;
      // 首屏只渲染前 12 个块，其余「展开全文」，避免长文一次性渲染卡顿
      if (blocks.length > 14) {
        head = blocks.slice(0, 12);
        rest = blocks.slice(12);
      } else {
        head = blocks;
        rest = [];
      }
      if (terms.length) {
        // 标记第一个命中块作为滚动锚点
        for (var i = 0; i < blocks.length; i++) {
          if (blocks[i].hit) {
            firstHitId = 'first-hit';
            if (i < head.length) headHitIdx = i;
            else restHitIdx = i - head.length;
            break;
          }
        }
      }
      that.setData({
        blocks: blocks,
        headBlocks: head,
        restBlocks: rest,
        contentLoading: false,
        contentEmpty: !blocks.length,
        showAll: blocks.length <= 14 || !!terms.length,
        headHitIdx: headHitIdx,
        restHitIdx: restHitIdx
      });
      // 渲染完成后滚到第一个命中处
      if (firstHitId) {
        setTimeout(function () {
          wx.pageScrollTo({ selector: '#first-hit', duration: 320, offsetTop: -90 });
        }, 380);
      }
    }, function () {
      that.setData({ contentLoading: false, contentEmpty: true });
    });
  },

  onToggleAll: function () {
    this.setData({ showAll: !this.data.showAll });
  },

  // 相关阅读：同一人的待读里向量近邻（服务端排序，空则不展示）
  loadRelated: function () {
    var that = this;
    api.readRelated(this.data.id, function (data) {
      that.setData({ relatedItems: (data && data.items) || [] });
    }, function () {});
  },

  onRelatedTap: function (e) {
    var id = e.currentTarget.dataset.id;
    if (!id) return;
    // 用 redirectTo 避免详情页无限堆栈
    wx.redirectTo({ url: '/pages/read-detail/read-detail?id=' + id });
  },

  /* ---------------- 操作 ---------------- */
  onMark: function (e) {
    var that = this;
    var s = e.currentTarget.dataset.status;
    var next = this.data.item.readStatus === s ? 'unread' : s;
    api.readPatch(this.data.id, { readStatus: next }, function (data) {
      that.setData({ item: data.item });
      wx.showToast({ title: next === 'done' ? '标记为已读' : '标记为未读', icon: 'none' });
    }, function () {});
  },

  onCopyLink: function () {
    var url = this.data.item && this.data.item.url;
    if (!url) return;
    wx.setClipboardData({
      data: url,
      success: function () { wx.showToast({ title: '链接已复制，可在浏览器打开', icon: 'none' }); }
    });
  },

  onRefetch: function () {
    var that = this;
    api.readRefetch(this.data.id, function () {
      wx.showToast({ title: '重新解析中', icon: 'none' });
      that.setData({ contentLoading: true });
      setTimeout(function () { that.loadDetail(); }, 2500);
    }, function () {});
  },

  onDelete: function () {
    var that = this;
    wx.showModal({
      title: '删除这条待读？',
      content: '正文快照与检索索引会一并清理，不可恢复。',
      confirmColor: '#EF5350',
      success: function (res) {
        if (!res.confirm) return;
        api.readDelete(that.data.id, function () {
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(function () { wx.navigateBack(); }, 600);
        }, function () {});
      }
    });
  },

  onCopySummary: function () {
    var it = this.data.item || {};
    var text = [it.title, it.summary, (it.highlights || []).map(function (h) { return '· ' + h; }).join('\n'), it.url]
      .filter(Boolean)
      .join('\n\n');
    wx.setClipboardData({
      data: text,
      success: function () { wx.showToast({ title: '已复制摘要', icon: 'success' }); }
    });
  },

  /* ---------------- 标签编辑 ---------------- */
  onToggleTagEdit: function () {
    this.setData({ editingTags: !this.data.editingTags });
  },

  onNewTagInput: function (e) {
    this.setData({ newTag: e.detail.value });
  },

  onAddTag: function () {
    var that = this;
    var t = (this.data.newTag || '').trim().replace(/^#/, '');
    if (!t) return;
    var tags = (this.data.item.tags || []).slice();
    if (tags.indexOf(t) >= 0) {
      wx.showToast({ title: '已有这个标签', icon: 'none' });
      return;
    }
    if (tags.length >= 12) {
      wx.showToast({ title: '标签最多 12 个', icon: 'none' });
      return;
    }
    tags.push(t);
    api.readPatch(this.data.id, { tags: tags }, function (data) {
      that.setData({ item: data.item, newTag: '' });
    }, function () {
      wx.showToast({ title: '保存失败', icon: 'none' });
    });
  },

  onRemoveTag: function (e) {
    var that = this;
    var t = e.currentTarget.dataset.tag;
    var tags = (this.data.item.tags || []).filter(function (x) { return x !== t; });
    api.readPatch(this.data.id, { tags: tags }, function (data) {
      that.setData({ item: data.item });
    }, function () {
      wx.showToast({ title: '删除失败', icon: 'none' });
    });
  },

  noop: function () {}
});
