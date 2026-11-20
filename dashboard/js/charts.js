(function () {
  'use strict';
  var E = window.Efhamha, esc = E.esc;
  /* درجات الأزرق (هوية Efhamha) */
  var COLORS = ['#3C4AE8', '#6671EE', '#939BF3', '#2430B8', '#5B64D6', '#BDC2F8', '#1F2899', '#8C95EE'];

  E.charts = {
    empty: function (msg) { return '<div class="empty-chart">' + esc(msg) + '</div>'; },

    bars: function (items, o) {
      o = o || {};
      var max = items.reduce(function (m, x) { return Math.max(m, x.value); }, 0) || 1;
      return '<div class="bars">' + items.map(function (x) {
        var w = Math.max(0, Math.round((x.value / (o.max || max)) * 100));
        return '<div class="bar-row"><span class="lab" title="' + esc(x.label) + '">' + esc(x.label) + '</span>' +
          '<div class="bar-track" role="img" aria-label="' + esc(x.label) + ': ' + x.value + '"><div class="bar-fill" style="width:' + w + '%"></div></div>' +
          '<span class="val">' + esc(o.suffix ? x.value + o.suffix : x.value) + '</span></div>';
      }).join('') + '</div>';
    },

    donut: function (items) {
      var total = items.reduce(function (s, x) { return s + x.value; }, 0);
      if (!total) return '';
      var r = 52, c = 2 * Math.PI * r, off = 0;
      var segs = items.map(function (x, i) {
        var len = (x.value / total) * c;
        var s = '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="' + COLORS[i % COLORS.length] + '" stroke-width="22" stroke-dasharray="' +
          len.toFixed(2) + ' ' + (c - len).toFixed(2) + '" stroke-dashoffset="' + (-off).toFixed(2) + '" transform="rotate(-90 70 70)"/>';
        off += len; return s;
      }).join('');
      return '<div class="donut-wrap"><svg viewBox="0 0 140 140" role="img" aria-label="توزيع الدروس">' + segs +
        '<text x="70" y="68" text-anchor="middle" font-size="24" font-weight="700" fill="currentColor">' + total + '</text>' +
        '<text x="70" y="88" text-anchor="middle" font-size="11" fill="currentColor" opacity=".7">درس</text></svg>' +
        '<ul class="legend">' + items.map(function (x, i) {
          return '<li><i style="background:' + COLORS[i % COLORS.length] + '"></i><span>' + esc(x.label) + '</span><b>' + x.value + '</b></li>';
        }).join('') + '</ul></div>';
    },

    /* حلقة نسبة مئوية (pct = null يعني لا توجد بيانات) */
    ring: function (pct, o) {
      o = o || {};
      var r = 36, c = 2 * Math.PI * r, v = pct == null ? 0 : Math.max(0, Math.min(100, pct));
      return '<div class="ring' + (pct == null ? ' is-empty' : '') + '" role="img" aria-label="' + esc(o.label || '') + ': ' + (pct == null ? 'لا بيانات' : v + '%') + '">' +
        '<svg viewBox="0 0 90 90" aria-hidden="true"><circle class="trk" cx="45" cy="45" r="' + r + '" fill="none" stroke-width="10"/>' +
        '<circle class="val" cx="45" cy="45" r="' + r + '" fill="none" stroke-width="10" stroke-dasharray="' + (c * v / 100).toFixed(2) + ' ' + c.toFixed(2) + '"/></svg><b>' + (pct == null ? '—' : v + '%') + '</b></div>';
    },

    /* أعمدة رأسية مكدّسة: items = [{label, pub, draft}] */
    stackedColumns: function (items) {
      var max = items.reduce(function (m, x) { return Math.max(m, x.pub + x.draft); }, 0) || 1;
      return '<div class="cols-chart">' + items.map(function (x) {
        var t = x.pub + x.draft, h = t ? Math.max(7, Math.round(t / max * 100)) : 0;
        return '<div class="col-item" title="' + esc(x.label) + ': ' + t + '"><span class="col-val">' + (t || '') + '</span><div class="col-track" role="img" aria-label="' + esc(x.label) + ': ' + x.pub + ' منشور، ' + x.draft + ' مسودة">' +
          (t ? '<div class="col-fill" style="height:' + h + '%"><span class="seg-draft" style="flex:' + x.draft + ' 1 0"></span><span class="seg-pub" style="flex:' + x.pub + ' 1 0"></span></div>' : '') +
          '</div><span class="col-name">' + esc(x.label) + '</span></div>';
      }).join('') + '</div>';
    },

    columns: function (values, labels, o) {
      o = o || {};
      var max = Math.max.apply(null, values.concat([1])), W = 520, H = 150, n = values.length, bw = (W - 20) / n;
      return '<svg class="line-chart" viewBox="0 0 ' + W + ' ' + (H + 22) + '" role="img" aria-label="' + esc(o.label || 'رسم بياني') + '">' + values.map(function (v, i) {
        var h = Math.round((v / max) * H), x = 10 + i * bw;
        return '<rect x="' + (x + 2).toFixed(1) + '" y="' + (H - h) + '" width="' + (bw - 4).toFixed(1) + '" height="' + h + '" rx="3" fill="var(--brand)" opacity="' + (v ? 1 : .18) + '"><title>' + esc(labels[i]) + ': ' + v + '</title></rect>' +
          (i % (o.every || 1) === 0 ? '<text x="' + (x + bw / 2).toFixed(1) + '" y="' + (H + 15) + '" text-anchor="middle">' + esc(labels[i]) + '</text>' : '');
      }).join('') + '</svg>';
    },

    line: function (points) {
      if (!points.length) return '';
      var W = 520, H = 190, pl = 30, pr = 26, pt = 14, pb = 30;
      var max = Math.max.apply(null, points.map(function (p) { return p.value; })) || 1;
      var n = points.length, step = n > 1 ? (W - pl - pr) / (n - 1) : 0;
      var xy = points.map(function (p, i) { return [pl + (n > 1 ? i * step : (W - pl - pr) / 2), pt + (1 - p.value / max) * (H - pt - pb)]; });
      var path = xy.map(function (q, i) { return (i ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ');
      var area = path + ' L' + xy[n - 1][0].toFixed(1) + ' ' + (H - pb) + ' L' + xy[0][0].toFixed(1) + ' ' + (H - pb) + ' Z';
      var every = Math.ceil(n / 7);
      return '<svg class="line-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="تطور الإنجازات بمرور الوقت">' +
        '<line x1="' + pl + '" x2="' + (W - pr) + '" y1="' + (H - pb) + '" y2="' + (H - pb) + '" stroke="var(--border)"/>' +
        '<text x="' + (pl - 6) + '" y="' + (pt + 4) + '" text-anchor="end">' + max + '</text><text x="' + (pl - 6) + '" y="' + (H - pb + 4) + '" text-anchor="end">0</text>' +
        '<path d="' + area + '" fill="var(--brand)" opacity=".12"/><path d="' + path + '" fill="none" stroke="var(--brand)" stroke-width="2.5" stroke-linejoin="round"/>' +
        xy.map(function (q) { return '<circle cx="' + q[0].toFixed(1) + '" cy="' + q[1].toFixed(1) + '" r="3.5" fill="var(--brand)"/>'; }).join('') +
        points.map(function (p, i) { return i % every === 0 ? '<text x="' + xy[i][0].toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle">' + esc(p.label) + '</text>' : ''; }).join('') + '</svg>';
    }
  };
})();
