// utils/helpers.js - 共享格式化工具
var COLORS = ['#4f6ef7', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
var IMP_RANK = { high: 0, medium: 1, low: 2 };
var URG_RANK = { urgent: 0, normal: 1 };

// decorate 缓存：按 package id 缓存装饰结果，避免每次切页/筛选重复计算
var _decorateCache = {};
var _cacheVersion = 0;

function invalidateDecorateCache() {
  _cacheVersion++;
  _decorateCache = {};
}

function invalidateDecorateCacheById(id) {
  delete _decorateCache[id];
}

function fmtTime(iso) {
  if (!iso) return '';
  var d = new Date(iso);
  if (isNaN(d)) return '';
  var now = new Date();
  var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var diff = Math.round((day - today) / 86400000);
  var hm = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
  if (diff === 0) return '今天 ' + hm;
  if (diff === -1) return '昨天 ' + hm;
  if (diff === 1) return '明天 ' + hm;
  if (diff === 2) return '后天 ' + hm;
  if (diff >= -6 && diff <= 6) return '';
  return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + hm;
}

function isToday(iso) {
  if (!iso) return false;
  var d = new Date(iso);
  if (isNaN(d)) return false;
  var now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

function ownerColor(name, members) {
  if (!name || !members || !members.length) return COLORS[0];
  var idx = 0;
  for (var i = 0; i < members.length; i++) { if (members[i].name === name) { idx = i; break; } }
  return COLORS[idx % COLORS.length];
}

// 兼容日期解析：后端返回 "2026-09-09 07:31" 空格格式，iOS WebKit 可能返回 NaN
function parseDate(s) {
  if (!s) return null;
  var d = new Date(s);
  if (!isNaN(d)) return d;
  // 手动解析 "YYYY-MM-DD HH:mm" 格式
  var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return new Date(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3]), parseInt(m[4]), parseInt(m[5]));
  return null;
}

function formatAmount(n) {
  if (!n) return '0';
  var num = Math.round(parseFloat(n) * 100) / 100;
  return num.toFixed(2).replace(/\.?0+$/, '');
}

function isOverdue(p) {
  if (p.status !== 'pending' || !p.arrivedAt) return false;
  var d = parseDate(p.arrivedAt);
  if (!d) return false;
  return d.getTime() < Date.now();
}

function impLabel(imp) {
  return imp === 'high' ? '🔴重要' : imp === 'low' ? '⚪低' : '🟡中';
}

function dueLabel(dueDate) {
  if (!dueDate) return '';
  var due = new Date(dueDate + 'T23:59:59');
  if (isNaN(due)) return dueDate;
  var now = new Date();
  var diff = Math.ceil((due - now) / 86400000);
  if (diff < 0) return '已逾期 ' + Math.abs(diff) + ' 天';
  if (diff === 0) return '今天到期';
  if (diff === 1) return '明天到期';
  if (diff <= 7) return '剩 ' + diff + ' 天';
  return '';
}

function dueDays(dueDate) {
  if (!dueDate) return '';
  var due = new Date(dueDate + 'T23:59:59');
  if (isNaN(due)) return '';
  var now = new Date();
  var diff = Math.ceil((due - now) / 86400000);
  if (diff < 0) return '已逾期 ' + Math.abs(diff) + ' 天';
  if (diff === 0) return '今天到期';
  if (diff === 1) return '明天';
  return '剩 ' + diff + ' 天';
}

function urgLabel(urg) {
  return urg === 'urgent' ? '⚡紧急' : '🕐普通';
}

function sortPackages(pkgs) {
  pkgs.sort(function (a, b) {
    if (a.status !== b.status) return a.status === 'pending' ? -1 : 1;
    if (!!a.overdue !== !!b.overdue) return a.overdue ? -1 : 1;
    var ai = IMP_RANK[a.importance], bi = IMP_RANK[b.importance];
    var au = URG_RANK[a.urgency], bu = URG_RANK[b.urgency];
    if (au !== bu) return au - bu;
    if (ai !== bi) return ai - bi;
    return (b.arrivedAt || '').localeCompare(a.arrivedAt || '');
  });
  return pkgs;
}

function decorate(p, members) {
  // 命中缓存直接返回
  var cached = _decorateCache[p.id];
  if (cached && cached.version === _cacheVersion) return cached.result;

  var d = Object.assign({}, p, {
    arrivedLabel: fmtTime(p.arrivedAt),
    pickedAtLabel: fmtTime(p.pickedAt),
    ownerColor: ownerColor(p.owner, members),
    overdue: isOverdue(p),
    impLabel: impLabel(p.importance || 'medium'),
    urgLabel: urgLabel(p.urgency || 'normal'),
    importance: p.importance || 'medium',
    urgency: p.urgency || 'normal'
  });
  d.occCount = p.occurrenceCount || 1;
  d.tagLabel = tagLabel(p.tag);
  d.sourceLabel = p.source || '';
  d.summaryText = summaryText(p);
  d.scheduleLabel = '';
  if (p.schedule && Array.isArray(p.schedule.times) && p.schedule.times.length) {
    var st = p.schedule.times.join(' / ');
    if (p.schedule.freq === 'weekly' && Array.isArray(p.schedule.weekdays) && p.schedule.weekdays.length) {
      var WD_CN = ['日', '一', '二', '三', '四', '五', '六'];
      d.scheduleLabel = '每' + p.schedule.weekdays.map(function (w) { return WD_CN[w]; }).join('/') + ' ' + st;
    } else if (p.schedule.freq === 'interval') {
      d.scheduleLabel = '每' + (parseInt(p.schedule.intervalDays, 10) || 2) + '天 ' + st;
    } else {
      d.scheduleLabel = st;
    }
  }
  // 块状卡片主值/副行（v0.16.1）："一块一事"排版——主值大字突出、上下小字环绕
  // pickup→取件码大字(code)；debt→金额大字(无金额则事项)；todo→事项标题；medication→药名
  var _type = p.type || 'todo';
  var bm = '', bs = '', bmType = 'text';
  if (_type === 'pickup') {
    bm = p.code || '';
    bmType = 'code';
    bs = p.note || '';
  } else if (_type === 'debt') {
    if (p.amount) {
      bm = '¥' + formatAmount(p.amount);
      bmType = 'amount';
      bs = [p.institution, p.title || p.code].filter(Boolean).join(' · ');
    } else {
      bm = p.title || p.code || '';
      bs = [p.institution, p.note].filter(Boolean).join(' · ');
    }
  } else if (_type === 'medication') {
    bm = p.title || p.code || '';
    bs = d.scheduleLabel || p.note || '';
  } else {
    bm = p.title || p.code || '';
    bs = p.note || '';
  }
  if (bm.length > 30) bm = bm.slice(0, 30) + '…';
  if (bs.length > 40) bs = bs.slice(0, 40) + '…';
  d.blockMain = bm;
  d.blockSub = bs;
  d.blockMainType = bmType;
  d.isPrivate = !!p.isPrivate;
  d.amount = p.amount || 0;
  d.amountLabel = p.amount ? formatAmount(p.amount) : '';
  d.institution = p.institution || '';
  d.dueDate = p.dueDate || '';
  d.dueLabel = dueLabel(p.dueDate);
  d.dueDays = dueDays(p.dueDate);
  // 忽略超期处理倒计时：天数/模式从 globalData 读取（delete=删除 | archive=转归档）
  var gd2 = (typeof getApp === 'function') && getApp().globalData ? getApp().globalData : {};
  var cleanupDays = gd2.ignoreCleanupDays ? gd2.ignoreCleanupDays : 7;
  var cleanupMode = gd2.ignoreCleanupMode === 'archive' ? 'archive' : 'delete';
  var actionText = cleanupMode === 'archive' ? '转入归档' : '自动删除';
  d.ignoreDeleteLabel = '';
  if (p.status === 'ignored' && p.ignoreAt) {
    var ignoreTs = Date.parse(p.ignoreAt);
    if (!isNaN(ignoreTs)) {
      var remainMs = (ignoreTs + cleanupDays * 86400000) - Date.now();
      if (remainMs <= 0) {
        d.ignoreDeleteLabel = '将' + actionText;
      } else {
        var remainDate = new Date(ignoreTs + cleanupDays * 86400000);
        var dateStr = (remainDate.getMonth() + 1) + '月' + remainDate.getDate() + '日';
        d.ignoreDeleteLabel = '将在' + dateStr + actionText;
      }
    }
  }
  // 存入缓存
  _decorateCache[p.id] = { result: d, version: _cacheVersion };
  return d;
}

function summaryText(p) {
  var code = p && p.code ? String(p.code) : '';
  var title = p && p.title ? String(p.title) : '';
  if (p && p.type === 'debt') {
    var inst = p.institution || '';
    var amt = p.amount ? '¥' + formatAmount(p.amount) : '';
    var parts = [];
    if (inst) parts.push(inst);
    if (amt) parts.push(amt);
    if (title) parts.push(title);
    if (code && title !== code) parts.push(code);
    var t = parts.join(' · ') || code;
    if (t.length <= 30) return t;
    return t.slice(0, 30) + '…';
  }
  if (title && title !== code) return title;
  if (!code) return '';
  if (code.length <= 24) return code;
  return code.slice(0, 24) + '…';
}

function tagLabel(tag) {
  if (!tag) return '';
  var map = { 'CLI': '🤖CLI', 'Webhook': '🔗Webhook', '家庭码': '🔑家庭码', '短信': '📱短信', '邮件': '📧邮件', '图片': '📷图片', '手动': '✏️手动' };
  return map[tag] || tag;
}

module.exports = {
  fmtTime: fmtTime,
  isToday: isToday,
  ownerColor: ownerColor,
  formatAmount: formatAmount,
  isOverdue: isOverdue,
  impLabel: impLabel,
  dueLabel: dueLabel,
  dueDays: dueDays,
  urgLabel: urgLabel,
  sortPackages: sortPackages,
  decorate: decorate,
  summaryText: summaryText,
  tagLabel: tagLabel,
  invalidateDecorateCache: invalidateDecorateCache,
  invalidateDecorateCacheById: invalidateDecorateCacheById,
  COLORS: COLORS,
  IMP_RANK: IMP_RANK,
  URG_RANK: URG_RANK
};
