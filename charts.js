/* Graphiques de la plateforme, en SVG, sans bibliothèque : courbes avec réticule, barres groupées, barres horizontales,
   mini-courbes. Marques fines (2 px), extrémités arrondies, grille discrète, info-bulle par survol et au clavier,
   clic pour descendre dans le détail. Les libellés sont insérés en textContent (jamais en HTML). */
(function (root) {
  "use strict";
  var NS = "http://www.w3.org/2000/svg";
  var NF = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
  function el(tag, attrs, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) { var t = el("text", Object.assign({ x: x, y: y }, attrs || {}), parent); t.textContent = s; return t; }
  function keur(v) {
    if (v == null || !isFinite(v)) return "";
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(".", ",") + " M€";
    if (a >= 1e3) return NF.format(Math.round(v / 1e3)) + " K€";
    return NF.format(Math.round(v)) + " €";
  }
  function eur(v) { return v == null || !isFinite(v) ? "" : NF.format(Math.round(v)).replace(/ | /g, " ") + " €"; }
  function nice(min, max, n) {
    if (min === max) { max = min + 1; }
    var span = max - min, step = Math.pow(10, Math.floor(Math.log10(span / n))), err = span / n / step;
    if (err >= 7.5) step *= 10; else if (err >= 3.5) step *= 5; else if (err >= 1.5) step *= 2;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (var v = lo; v <= hi + step / 2; v += step) ticks.push(Math.abs(v) < step / 1e6 ? 0 : v);
    return { lo: lo, hi: hi, ticks: ticks };
  }
  function tooltip(host) {
    var t = host.querySelector(".ch-tip");
    if (!t) { t = document.createElement("div"); t.className = "ch-tip"; t.setAttribute("role", "status"); host.appendChild(t); }
    return t;
  }
  function showTip(host, x, y, title, rows) {
    var t = tooltip(host); t.innerHTML = "";
    var h = document.createElement("div"); h.className = "ch-tip-t"; h.textContent = title; t.appendChild(h);
    rows.forEach(function (r) {
      if (r.value == null) return;
      var d = document.createElement("div"); d.className = "ch-tip-r";
      var k = document.createElement("span"); k.className = "ch-key" + (r.dash ? " dash" : ""); k.style.borderColor = r.color; d.appendChild(k);
      var v = document.createElement("strong"); v.textContent = r.fmt ? r.fmt(r.value) : eur(r.value); d.appendChild(v);
      var l = document.createElement("span"); l.className = "ch-tip-l"; l.textContent = r.name; d.appendChild(l);
      t.appendChild(d);
    });
    t.style.display = "block";
    var w = host.clientWidth, tw = t.offsetWidth;
    t.style.left = Math.max(4, Math.min(w - tw - 4, x + 14)) + "px"; t.style.top = Math.max(4, y - 10) + "px";
  }
  function hideTip(host) { var t = host.querySelector(".ch-tip"); if (t) t.style.display = "none"; }

  /* Courbes. opts : labels, series [{name, values, color, split (index à partir duquel le trait passe en pointillés), dash, width}],
     threshold {value, label}, height, fmt, onClick(i), active (index surligné) */
  function line(host, o) {
    host.innerHTML = ""; host.classList.add("ch");
    var W = Math.max(280, host.clientWidth || 600), H = o.height || 260, pl = 56, pr = 12, pt = 12, pb = 26;
    var all = []; o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    if (o.threshold) all.push(o.threshold.value);
    if (!all.length) { host.textContent = "Pas de données sur la période."; return; }
    var sc = nice(Math.min(0, Math.min.apply(null, all)), Math.max.apply(null, all), 4), n = o.labels.length;
    var X = function (i) { return pl + (n <= 1 ? (W - pl - pr) / 2 : i * (W - pl - pr) / (n - 1)); };
    var Y = function (v) { return pt + (H - pt - pb) * (1 - (v - sc.lo) / (sc.hi - sc.lo)); };
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, class: "ch-svg", role: "img", "aria-label": o.title || "graphique" }, host);
    sc.ticks.forEach(function (v) {
      el("line", { x1: pl, x2: W - pr, y1: Y(v), y2: Y(v), class: v === 0 ? "ch-zero" : "ch-grid" }, svg);
      txt(svg, pl - 8, Y(v) + 4, keur(v), { class: "ch-ax", "text-anchor": "end" });
    });
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pl - pr) / 64))));
    o.labels.forEach(function (l, i) { if (i % every === 0 || i === n - 1 && n < 30) txt(svg, X(i), H - 8, l, { class: "ch-ax", "text-anchor": "middle" }); });
    if (o.split != null && o.split > 0 && o.split < n) {
      el("rect", { x: X(o.split - 0.5 < 0 ? 0 : o.split - 0.5), y: pt, width: W - pr - X(Math.max(0, o.split - 0.5)), height: H - pt - pb, class: "ch-fc" }, svg);
      txt(svg, X(Math.max(0, o.split - 0.5)) + 6, pt + 12, "prévision", { class: "ch-ax ch-fc-l" });
    }
    if (o.threshold) {
      el("line", { x1: pl, x2: W - pr, y1: Y(o.threshold.value), y2: Y(o.threshold.value), class: "ch-thr" }, svg);
      txt(svg, W - pr - 4, Y(o.threshold.value) - 6, o.threshold.label, { class: "ch-ax ch-thr-l", "text-anchor": "end" });
    }
    function path(vals, a, b) {
      var d = "", pen = false;
      for (var i = a; i <= b; i++) {
        var v = vals[i];
        if (v == null || !isFinite(v)) { pen = false; continue; }
        d += (pen ? "L" : "M") + X(i).toFixed(1) + " " + Y(v).toFixed(1); pen = true;
      }
      return d;
    }
    o.series.forEach(function (s) {
      var w = s.width || 2, sp = s.split != null ? s.split : (s.dash ? 0 : n);
      if (sp > 0) el("path", { d: path(s.values, 0, Math.min(n - 1, sp)), class: "ch-line", stroke: s.color, "stroke-width": w }, svg);
      if (sp < n) el("path", { d: path(s.values, Math.max(0, sp), n - 1), class: "ch-line", stroke: s.color, "stroke-width": w, "stroke-dasharray": "5 4" }, svg);
    });
    var cross = el("line", { x1: 0, x2: 0, y1: pt, y2: H - pb, class: "ch-cross", visibility: "hidden" }, svg);
    var dots = o.series.map(function (s) { return el("circle", { r: 4, fill: s.color, class: "ch-dot", visibility: "hidden" }, svg); });
    var hit = el("rect", { x: pl, y: pt, width: W - pl - pr, height: H - pt - pb, class: "ch-hit", tabindex: 0 }, svg);
    var cur = -1;
    function at(i, px, py) {
      cur = i; cross.setAttribute("x1", X(i)); cross.setAttribute("x2", X(i)); cross.setAttribute("visibility", "visible");
      o.series.forEach(function (s, k) {
        var v = s.values[i];
        if (v == null || !isFinite(v)) { dots[k].setAttribute("visibility", "hidden"); return; }
        dots[k].setAttribute("cx", X(i)); dots[k].setAttribute("cy", Y(v)); dots[k].setAttribute("visibility", "visible");
      });
      showTip(host, px != null ? px : X(i), py != null ? py : pt + 10, (o.tipTitle ? o.tipTitle(i) : o.labels[i]),
        o.series.map(function (s) { return { name: s.name, value: s.values[i], color: s.color, dash: s.split != null && i >= s.split || s.dash, fmt: o.fmt }; }));
    }
    function idx(evt) {
      var r = svg.getBoundingClientRect(), x = (evt.clientX - r.left) * W / r.width;
      return Math.max(0, Math.min(n - 1, Math.round((x - pl) / ((W - pl - pr) / Math.max(1, n - 1)))));
    }
    hit.addEventListener("pointermove", function (e) { var r = host.getBoundingClientRect(); at(idx(e), e.clientX - r.left, e.clientY - r.top); });
    hit.addEventListener("pointerleave", function () { cross.setAttribute("visibility", "hidden"); dots.forEach(function (d) { d.setAttribute("visibility", "hidden"); }); hideTip(host); });
    hit.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { at(Math.min(n - 1, cur + 1)); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { at(Math.max(0, cur < 0 ? n - 1 : cur - 1)); e.preventDefault(); }
      else if (e.key === "Enter" && o.onClick && cur >= 0) o.onClick(cur);
    });
    hit.addEventListener("focus", function () { at(cur < 0 ? n - 1 : cur); });
    hit.addEventListener("blur", function () { hideTip(host); });
    if (o.onClick) { hit.style.cursor = "pointer"; hit.addEventListener("click", function (e) { o.onClick(idx(e)); }); }
  }

  /* Barres verticales groupées. opts : labels, series [{name, values, color}], height, fmt, onClick(i, k) */
  function bars(host, o) {
    host.innerHTML = ""; host.classList.add("ch");
    var W = Math.max(280, host.clientWidth || 600), H = o.height || 240, pl = 56, pr = 8, pt = 12, pb = 26;
    var all = [0]; o.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null && isFinite(v)) all.push(v); }); });
    var sc = nice(Math.min.apply(null, all), Math.max.apply(null, all), 4), n = o.labels.length, m = o.series.length;
    var Y = function (v) { return pt + (H - pt - pb) * (1 - (v - sc.lo) / (sc.hi - sc.lo)); };
    var bw = (W - pl - pr) / Math.max(1, n), gap = 2, inner = Math.max(2, Math.min(28, (bw * 0.72 - gap * (m - 1)) / m));
    var svg = el("svg", { viewBox: "0 0 " + W + " " + H, width: W, height: H, class: "ch-svg", role: "img", "aria-label": o.title || "graphique" }, host);
    sc.ticks.forEach(function (v) { el("line", { x1: pl, x2: W - pr, y1: Y(v), y2: Y(v), class: v === 0 ? "ch-zero" : "ch-grid" }, svg); txt(svg, pl - 8, Y(v) + 4, keur(v), { class: "ch-ax", "text-anchor": "end" }); });
    var every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - pl - pr) / 56))));
    o.labels.forEach(function (l, i) { if (i % every === 0) txt(svg, pl + bw * i + bw / 2, H - 8, l, { class: "ch-ax", "text-anchor": "middle" }); });
    for (var i = 0; i < n; i++) {
      var g = el("g", { class: "ch-col", tabindex: 0 }, svg), x0 = pl + bw * i + (bw - (inner * m + gap * (m - 1))) / 2;
      el("rect", { x: pl + bw * i, y: pt, width: bw, height: H - pt - pb, class: "ch-colhit" }, g);
      o.series.forEach(function (s, k) {
        var v = s.values[i]; if (v == null || !isFinite(v) || v === 0) return;
        var y0 = Y(0), y1 = Y(v), top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0)), r = Math.min(4, inner / 2, h);
        var x = x0 + k * (inner + gap);
        // extrémité arrondie côté données, base carrée sur l'axe
        var d = v >= 0 ? ("M" + x + " " + y0 + "V" + (top + r) + "Q" + x + " " + top + " " + (x + r) + " " + top + "H" + (x + inner - r) + "Q" + (x + inner) + " " + top + " " + (x + inner) + " " + (top + r) + "V" + y0 + "Z")
                       : ("M" + x + " " + y0 + "V" + (top + h - r) + "Q" + x + " " + (top + h) + " " + (x + r) + " " + (top + h) + "H" + (x + inner - r) + "Q" + (x + inner) + " " + (top + h) + " " + (x + inner) + " " + (top + h - r) + "V" + y0 + "Z");
        el("path", { d: d, fill: s.color, class: "ch-bar" + (s.muted && s.muted[i] ? " muted" : "") }, g);
      });
      (function (i, g) {
        function tip(e) {
          var r = host.getBoundingClientRect();
          showTip(host, e && e.clientX != null ? e.clientX - r.left : pl + bw * i, e && e.clientY != null ? e.clientY - r.top : pt, o.tipTitle ? o.tipTitle(i) : o.labels[i],
            o.series.map(function (s) { return { name: s.name, value: s.values[i], color: s.color, fmt: o.fmt }; }).concat(o.extraRows ? o.extraRows(i) : []));
          g.classList.add("on");
        }
        g.addEventListener("pointermove", tip); g.addEventListener("focus", function () { tip(); });
        g.addEventListener("pointerleave", function () { hideTip(host); g.classList.remove("on"); });
        g.addEventListener("blur", function () { hideTip(host); g.classList.remove("on"); });
        if (o.onClick) { g.style.cursor = "pointer"; g.addEventListener("click", function () { o.onClick(i); }); g.addEventListener("keydown", function (e) { if (e.key === "Enter") o.onClick(i); }); }
      })(i, g);
    }
  }

  /* Barres horizontales triées, une série. items [{label, value, sub}], color, fmt, onClick(item) */
  function hbars(host, o) {
    host.innerHTML = ""; host.classList.add("ch-h");
    var max = 0; o.items.forEach(function (it) { max = Math.max(max, Math.abs(it.value)); });
    o.items.forEach(function (it) {
      var row = document.createElement(o.onClick ? "button" : "div"); row.className = "hb-row"; if (o.onClick) row.type = "button";
      var lab = document.createElement("span"); lab.className = "hb-l"; lab.textContent = it.label; row.appendChild(lab);
      var track = document.createElement("span"); track.className = "hb-t";
      var bar = document.createElement("span"); bar.className = "hb-b"; bar.style.width = (max ? Math.max(1.5, Math.abs(it.value) / max * 100) : 0) + "%"; bar.style.background = it.color || o.color;
      track.appendChild(bar); row.appendChild(track);
      var v = document.createElement("span"); v.className = "hb-v num"; v.textContent = (o.fmt || keur)(it.value); row.appendChild(v);
      if (it.sub) { var s = document.createElement("span"); s.className = "hb-s"; s.textContent = it.sub; row.appendChild(s); }
      if (o.onClick) row.addEventListener("click", function () { o.onClick(it); });
      host.appendChild(row);
    });
  }

  /* Mini-courbe en ligne (chaîne SVG) */
  function spark(vals, color, w, h) {
    w = w || 84; h = h || 22;
    var v = vals.filter(function (x) { return x != null && isFinite(x); });
    if (v.length < 2) return "";
    var mn = Math.min.apply(null, v), mx = Math.max.apply(null, v), d = "";
    vals.forEach(function (x, i) { if (x == null || !isFinite(x)) return; d += (d ? "L" : "M") + (i * (w - 2) / (vals.length - 1) + 1).toFixed(1) + " " + (h - 2 - (mx === mn ? 0.5 : (x - mn) / (mx - mn)) * (h - 4)).toFixed(1); });
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + " " + h + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="' + (color || "#4f46e5") + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }

  root.Charts = { line: line, bars: bars, hbars: hbars, spark: spark, keur: keur, eur: eur };
})(this);
