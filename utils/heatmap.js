// utils/heatmap.js - GitHub 风格活跃度热力图构建（概览页 / 年度报告共用）
// 色阶按当年有动态天数的四分位划分，0 = 白色（未使用）

function todayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}

// activity: [{date: 'YYYY-MM-DD', count: n}] 全年逐日
// 返回 { weeks: [[cell]], months: [{label, left}], activeDays, total }
function buildHeatmap(activity, year) {
  var counts = activity.map(function (a) { return a.count; })
    .filter(function (c) { return c > 0; })
    .sort(function (a, b) { return a - b; });
  var pick = function (p) {
    return counts.length ? counts[Math.min(counts.length - 1, Math.floor(counts.length * p))] : 1;
  };
  var t1 = pick(0.25), t2 = pick(0.5), t3 = pick(0.75);
  var levelOf = function (c) {
    if (!c) return 0;
    if (c <= t1) return 1;
    if (c <= t2) return 2;
    if (c <= t3) return 3;
    return 4;
  };
  var today = todayStr();
  var CELL = 14, GAP = 4; // rpx
  var weeks = [];
  var months = [];
  var lastMonth = -1;
  var col = [];
  var seq = 0;
  var flush = function () {
    if (!col.length) return;
    weeks.push(col);
    var first = null;
    for (var k = 0; k < col.length; k++) {
      if (!col[k].blank) { first = col[k]; break; }
    }
    if (first) {
      var m = parseInt(first.date.slice(5, 7), 10);
      if (m !== lastMonth) {
        months.push({ label: m + '月', left: (weeks.length - 1) * (CELL + GAP) });
        lastMonth = m;
      }
    }
    col = [];
  };
  var lead = new Date(year, 0, 1).getDay(); // 1月1日是周几（0=周日）
  for (var i = 0; i < lead; i++) col.push({ blank: true, key: 'b' + (seq++) });
  var todayCol = -1; // 今天所在列（0-based，供默认滚动定位）
  activity.forEach(function (a) {
    col.push({
      key: 'd' + (seq++),
      date: a.date,
      count: a.count,
      level: levelOf(a.count),
      future: a.date > today
    });
    if (a.date === today && todayCol < 0) todayCol = weeks.length; // 当前正在构建的列即将成为第 weeks.length 列
    if (col.length === 7) flush();
  });
  if (col.length) {
    while (col.length < 7) col.push({ blank: true, key: 'b' + (seq++) });
    flush();
  }
  var total = activity.reduce(function (s, a) { return s + a.count; }, 0);
  var todayLeft = todayCol > 0 ? todayCol * (CELL + GAP) : 0; // 今天列左缘（rpx）
  return { weeks: weeks, months: months, activeDays: counts.length, total: total, todayLeft: todayLeft };
}

module.exports = { buildHeatmap: buildHeatmap, todayStr: todayStr };
