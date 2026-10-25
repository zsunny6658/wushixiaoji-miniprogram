// utils/highlight.js - 检索命中词高亮（纯函数，列表页与详情页共用）

/**
 * 把查询拆成高亮词：整句优先，再拆空格段（中文整句、英文按词）。
 * 长度 < 2 的碎片不参与高亮（视觉噪声）。
 */
function splitTerms(q) {
  var raw = String(q || '').trim();
  if (!raw) return [];
  var terms = [raw];
  raw.split(/\s+/).forEach(function (t) {
    t = t.trim();
    if (t && t.length >= 2 && terms.indexOf(t) < 0) terms.push(t);
  });
  return terms.slice(0, 6);
}

/**
 * 文本 → 段数组 [{t:'片段', hit:true|false}]，用于嵌套 <text> 渲染。
 * 命中不重叠、按原文顺序；无命中时返回 null（调用方回退纯文本渲染）。
 */
function segs(text, terms) {
  var s = String(text || '');
  if (!s || !terms || !terms.length) return null;
  var marks = new Array(s.length); // 每个字符是否命中
  var any = false;
  terms.forEach(function (term) {
    var idx = s.indexOf(term);
    while (idx >= 0) {
      for (var i = idx; i < idx + term.length; i++) marks[i] = true;
      any = true;
      idx = s.indexOf(term, idx + term.length);
    }
  });
  if (!any) return null;

  var out = [];
  var buf = '';
  for (var i = 0; i < s.length; i++) {
    if (marks[i]) {
      if (buf) { out.push({ t: buf, hit: false }); buf = ''; }
      out.push({ t: s[i], hit: true });
    } else {
      buf += s[i];
    }
  }
  if (buf) out.push({ t: buf, hit: false });
  // 合并相邻同命中态
  var merged = [];
  out.forEach(function (seg) {
    var last = merged[merged.length - 1];
    if (last && last.hit === seg.hit) last.t += seg.t;
    else merged.push({ t: seg.t, hit: seg.hit });
  });
  return merged;
}

module.exports = { splitTerms: splitTerms, segs: segs };
