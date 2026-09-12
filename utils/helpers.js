// utils/helpers.js - 共享格式化工具
var COLORS = ['#4f6ef7', '#f59e0b', '#22c55e', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#f97316'];
var IMP_RANK = { high: 0, medium: 1, low: 2 };
var URG_RANK = { urgent: 0, normal: 1 };

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

function isOverdue(p) {
  if (p.status !== 'pending' || !p.arrivedAt) return false;
  var d = parseDate(p.arrivedAt);
  if (!d) return false;
  return d.getTime() < Date.now();
}

function impLabel(imp) {
  return imp === 'high' ? '🔴重要' : imp === 'low' ? '⚪低' : '🟡中';
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
  return d;
}

function summaryText(p) {
  var code = p && p.code ? String(p.code) : '';
  var title = p && p.title ? String(p.title) : '';
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
  isOverdue: isOverdue,
  impLabel: impLabel,
  urgLabel: urgLabel,
  sortPackages: sortPackages,
  decorate: decorate,
  summaryText: summaryText,
  tagLabel: tagLabel,
  COLORS: COLORS,
  IMP_RANK: IMP_RANK,
  URG_RANK: URG_RANK
};
