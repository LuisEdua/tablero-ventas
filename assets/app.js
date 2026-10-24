/* Tablero de Ventas — lógica del cliente (sin build, listo para GitHub Pages) */
(() => {
  'use strict';

  const CSV_URL = 'data/ventas_demo.csv';
  const DAY = 86400000;
  const DIMS = ['region', 'categoria', 'producto', 'canal', 'cliente'];
  const DIM_LABEL = { region: 'Región', categoria: 'Categoría', producto: 'Producto', canal: 'Canal', cliente: 'Cliente' };
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const DOW = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

  // ---------- Formato ----------
  const nfInt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const nfMoney = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
  const nfMoney2 = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const money = v => nfMoney.format(v);
  const money2 = v => nfMoney2.format(v);
  const int = v => nfInt.format(v);
  const pct = (v, d = 1) => (v * 100).toFixed(d) + '%';
  function compact(v, prefix = '') {
    const a = Math.abs(v), s = v < 0 ? '-' : '';
    if (a >= 1e9) return s + prefix + (a / 1e9).toFixed(a >= 1e10 ? 1 : 2) + ' MM';
    if (a >= 1e6) return s + prefix + (a / 1e6).toFixed(a >= 1e7 ? 1 : 2) + ' M';
    if (a >= 1e3) return s + prefix + (a / 1e3).toFixed(a >= 1e4 ? 0 : 1) + ' K';
    return s + prefix + Math.round(a);
  }
  const cmoney = v => compact(v, '$');
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- Fechas (días desde epoch, UTC) ----------
  const toDay = s => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / DAY;
  const dateOf = d => new Date(d * DAY);
  const iso = d => dateOf(d).toISOString().slice(0, 10);
  const fmtDay = d => { const t = dateOf(d); return `${t.getUTCDate()} ${MONTHS[t.getUTCMonth()]} ${t.getUTCFullYear()}`; };
  const monthKey = d => { const t = dateOf(d); return t.getUTCFullYear() * 12 + t.getUTCMonth(); };
  const monthStart = mk => Date.UTC(Math.floor(mk / 12), mk % 12, 1) / DAY;
  const fmtMonth = mk => `${MONTHS[mk % 12]} ${String(Math.floor(mk / 12)).slice(2)}`;
  const weekStart = d => d - ((dateOf(d).getUTCDay() + 6) % 7);
  const dowOf = d => (dateOf(d).getUTCDay() + 6) % 7;

  // ---------- Estado ----------
  const S = {
    rows: [], minDay: 0, maxDay: 0,
    values: {}, color: {}, prodCat: {},
    f: { preset: 'all', from: 0, to: 0, region: new Set(), categoria: new Set(), producto: new Set(), canal: new Set(), cliente: new Set() },
    gran: 'month', tab: 'resumen',
    cur: [], prev: [], prevRange: null,
  };
  const charts = {};
  const tables = {};

  // ---------- Tema ----------
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  let T = {};
  function readTheme() {
    T = {
      ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), grid: css('--grid'), axis: css('--axis'),
      surface: css('--surface'), surface2: css('--surface-2'), accent: css('--accent'), border: css('--border-strong'),
      series: [1, 2, 3, 4, 5, 6, 7, 8].map(i => css('--s' + i)),
      seq: [0, 1, 2, 3, 4].map(i => css('--seq-' + i)),
      font: css('--font'),
    };
  }
  const colorOf = (dim, v) => T.series[S.color[dim][v] % 8];

  // ---------- Carga ----------
  Papa.parse(CSV_URL, {
    download: true, header: true, skipEmptyLines: true,
    transformHeader: h => h.replace(/^﻿/, '').trim(),
    complete: res => init(res.data),
    error: err => {
      document.querySelector('#loading p').textContent = 'No se pudieron cargar los datos (' + err.message + '). Si abriste el archivo localmente, sírvelo con un servidor web.';
      document.querySelector('.spinner').style.display = 'none';
    },
  });

  function init(raw) {
    const rows = [];
    let min = Infinity, max = -Infinity;
    for (const r of raw) {
      if (!r.fecha) continue;
      const d = toDay(r.fecha);
      const qty = +r.cantidad, price = +r.precio_unitario, cost = +r.costo_unitario;
      if (!isFinite(d) || !isFinite(qty)) continue;
      const rev = qty * price;
      rows.push({
        d, fecha: r.fecha, region: r.region, categoria: r.categoria, producto: r.producto, canal: r.canal, cliente: r.cliente,
        qty, price, cost, rev, profit: rev - qty * cost,
      });
      if (d < min) min = d; if (d > max) max = d;
    }
    S.rows = rows; S.minDay = min; S.maxDay = max;
    for (const k of DIMS) {
      S.values[k] = [...new Set(rows.map(r => r[k]))].sort((a, b) => a.localeCompare(b, 'es'));
      S.color[k] = Object.fromEntries(S.values[k].map((v, i) => [v, i]));
    }
    for (const r of rows) S.prodCat[r.producto] = r.categoria;
    // Productos: color de su categoría
    S.color.producto = Object.fromEntries(S.values.producto.map(p => [p, S.color.categoria[S.prodCat[p]]]));

    document.getElementById('dataInfo').textContent =
      `${int(rows.length)} transacciones · ${fmtDay(min)} – ${fmtDay(max)} · ${S.values.cliente.length} clientes`;
    const fFrom = document.getElementById('fFrom'), fTo = document.getElementById('fTo');
    fFrom.min = fTo.min = iso(min); fFrom.max = fTo.max = iso(max);

    readTheme();
    setupFilters();
    setupTabs();
    setupTables();
    setupMisc();
    readHash();
    update();
    document.getElementById('loading').classList.add('done');
  }

  // ---------- Filtrado ----------
  function presetRange(p) {
    const max = S.maxDay, min = S.minDay;
    const y = dateOf(max).getUTCFullYear();
    switch (p) {
      case '30d': return [Math.max(min, max - 29), max];
      case '90d': return [Math.max(min, max - 89), max];
      case '12m': return [Math.max(min, monthStart(monthKey(max) - 11)), max];
      case 'ytd': return [Math.max(min, Date.UTC(y, 0, 1) / DAY), max];
      case 'prevyear': return [Math.max(min, Date.UTC(y - 1, 0, 1) / DAY), Math.min(max, Date.UTC(y - 1, 11, 31) / DAY)];
      default: return [min, max];
    }
  }

  function filterRows(from, to, skipDim) {
    const f = S.f, out = [];
    const sets = DIMS.filter(k => k !== skipDim && f[k].size).map(k => [k, f[k]]);
    for (const r of S.rows) {
      if (r.d < from || r.d > to) continue;
      let ok = true;
      for (let i = 0; i < sets.length; i++) if (!sets[i][1].has(r[sets[i][0]])) { ok = false; break; }
      if (ok) out.push(r);
    }
    return out;
  }

  function totals(rows) {
    let rev = 0, profit = 0, qty = 0;
    const cl = new Set();
    for (const r of rows) { rev += r.rev; profit += r.profit; qty += r.qty; cl.add(r.cliente); }
    return { rev, profit, qty, n: rows.length, margin: rev ? profit / rev : 0, ticket: rows.length ? rev / rows.length : 0, clientes: cl.size };
  }

  function groupBy(rows, key) {
    const m = new Map();
    for (const r of rows) {
      const k = typeof key === 'function' ? key(r) : r[key];
      let g = m.get(k);
      if (!g) { g = { key: k, rev: 0, profit: 0, qty: 0, n: 0 }; m.set(k, g); }
      g.rev += r.rev; g.profit += r.profit; g.qty += r.qty; g.n++;
    }
    return m;
  }

  function update() {
    const f = S.f;
    if (f.preset !== 'custom') [f.from, f.to] = presetRange(f.preset);
    document.getElementById('fPreset').value = f.preset;
    document.getElementById('fFrom').value = iso(f.from);
    document.getElementById('fTo').value = iso(f.to);

    S.cur = filterRows(f.from, f.to);
    const len = f.to - f.from + 1;
    const pf = f.from - len, pt = f.from - 1;
    S.prevRange = pt >= S.minDay ? [Math.max(pf, S.minDay), pt] : null;
    S.prevComplete = S.prevRange && pf >= S.minDay;
    S.prev = S.prevRange ? filterRows(S.prevRange[0], S.prevRange[1]) : [];

    refreshFilterControls();
    renderChips();
    renderKPIs();
    renderTab();
    writeHash();
  }

  // ---------- Multi-select ----------
  const ms = {};
  const chevron = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function setupFilters() {
    document.querySelectorAll('.ms').forEach((el, i, all) => {
      const key = el.dataset.key;
      el.innerHTML = `<button type="button" class="ms-btn" aria-haspopup="listbox" aria-expanded="false"><span class="ms-value"></span>${chevron}</button>
        <div class="ms-panel${i >= all.length - 2 ? ' right' : ''}" hidden>
          <input type="search" class="control ms-search" placeholder="Buscar ${DIM_LABEL[key].toLowerCase()}…" aria-label="Buscar">
          <div class="ms-actions"><span class="ms-count"></span><span><button type="button" data-a="visible">Seleccionar visibles</button><button type="button" data-a="clear">Limpiar</button></span></div>
          <div class="ms-list" role="listbox" aria-multiselectable="true"></div>
        </div>`;
      const btn = el.querySelector('.ms-btn'), panel = el.querySelector('.ms-panel'),
        search = el.querySelector('.ms-search'), list = el.querySelector('.ms-list');
      ms[key] = { el, btn, panel, search, list };
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const open = panel.hidden;
        closeAllMs();
        if (open) { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); renderMsList(key); search.value = ''; renderMsList(key); search.focus(); }
      });
      panel.addEventListener('click', e => e.stopPropagation());
      search.addEventListener('input', () => renderMsList(key));
      list.addEventListener('change', e => {
        const v = e.target.value;
        e.target.checked ? S.f[key].add(v) : S.f[key].delete(v);
        if (key === 'categoria') pruneProducts();
        update();
      });
      el.querySelector('[data-a="clear"]').addEventListener('click', () => { S.f[key].clear(); update(); renderMsList(key); });
      el.querySelector('[data-a="visible"]').addEventListener('click', () => {
        list.querySelectorAll('input').forEach(i => S.f[key].add(i.value));
        if (key === 'categoria') pruneProducts();
        update(); renderMsList(key);
      });
    });
    document.addEventListener('click', closeAllMs);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllMs(); });

    const preset = document.getElementById('fPreset');
    preset.addEventListener('change', () => {
      S.f.preset = preset.value;
      S.gran = { '30d': 'day', '90d': 'week' }[preset.value] || 'month';
      update();
    });
    const onDate = () => {
      let a = toDay(document.getElementById('fFrom').value), b = toDay(document.getElementById('fTo').value);
      if (!isFinite(a) || !isFinite(b)) return;
      a = Math.max(S.minDay, Math.min(a, S.maxDay)); b = Math.max(S.minDay, Math.min(b, S.maxDay));
      if (a > b) [a, b] = [b, a];
      S.f.preset = 'custom'; S.f.from = a; S.f.to = b; update();
    };
    document.getElementById('fFrom').addEventListener('change', onDate);
    document.getElementById('fTo').addEventListener('change', onDate);
    document.getElementById('btnReset').addEventListener('click', () => {
      DIMS.forEach(k => S.f[k].clear()); S.f.preset = 'all'; update();
    });
  }

  function pruneProducts() {
    const cats = S.f.categoria;
    if (!cats.size) return;
    for (const p of [...S.f.producto]) if (!cats.has(S.prodCat[p])) S.f.producto.delete(p);
  }

  function closeAllMs() {
    for (const k in ms) { ms[k].panel.hidden = true; ms[k].btn.setAttribute('aria-expanded', 'false'); }
  }

  function msOptions(key) {
    let vals = S.values[key];
    if (key === 'producto' && S.f.categoria.size) vals = vals.filter(p => S.f.categoria.has(S.prodCat[p]));
    return vals;
  }

  function renderMsList(key) {
    const m = ms[key];
    if (m.panel.hidden) return;
    const q = m.search.value.trim().toLowerCase();
    // ventas disponibles con el resto de filtros para mostrar contexto
    const ctx = groupBy(filterRows(S.f.from, S.f.to, key), key);
    const tot = [...ctx.values()].reduce((a, g) => a + g.rev, 0) || 1;
    const vals = msOptions(key).filter(v => !q || v.toLowerCase().includes(q));
    m.list.innerHTML = vals.length ? vals.map(v => {
      const g = ctx.get(v);
      const showSw = key !== 'cliente';
      return `<label class="ms-opt"><input type="checkbox" value="${esc(v)}"${S.f[key].has(v) ? ' checked' : ''}>
        ${showSw ? `<span class="sw" style="background:${colorOf(key, v)}"></span>` : ''}
        <span class="lbl">${esc(v)}</span><span class="muted" style="font-size:11.5px;color:var(--muted)">${g ? pct(g.rev / tot) : '—'}</span></label>`;
    }).join('') : '<div class="ms-empty">Sin coincidencias</div>';
    m.el.querySelector('.ms-count').textContent = `${S.f[key].size} de ${msOptions(key).length}`;
  }

  function refreshFilterControls() {
    for (const k of DIMS) {
      const m = ms[k], set = S.f[k];
      let txt = k === 'region' || k === 'categoria' ? 'Todas' : 'Todos';
      if (set.size === 1) txt = [...set][0];
      else if (set.size > 1) txt = `${set.size} seleccionados`;
      m.el.querySelector('.ms-value').textContent = txt;
      m.btn.classList.toggle('active', set.size > 0);
      renderMsList(k);
    }
  }

  function renderChips() {
    const el = document.getElementById('chips');
    const chips = [];
    if (S.f.preset !== 'all') chips.push({ k: 'periodo', label: 'Periodo', v: `${fmtDay(S.f.from)} – ${fmtDay(S.f.to)}` });
    for (const k of DIMS) for (const v of S.f[k]) chips.push({ k, label: DIM_LABEL[k], v });
    el.innerHTML = chips.map(c => `<span class="chip"><b>${c.label}:</b> ${esc(c.v)}<button type="button" aria-label="Quitar filtro" data-k="${c.k}" data-v="${esc(c.v)}">×</button></span>`).join('');
    el.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      if (b.dataset.k === 'periodo') S.f.preset = 'all'; else S.f[b.dataset.k].delete(b.dataset.v);
      update();
    }));
  }

  function toggleFilter(key, value) {
    const set = S.f[key];
    if (set.size === 1 && set.has(value)) set.clear();
    else { set.clear(); set.add(value); }
    if (key === 'categoria') pruneProducts();
    update();
  }

  // ---------- KPIs ----------
  function renderKPIs() {
    const c = totals(S.cur), p = S.prevRange ? totals(S.prev) : null;
    // Tendencia: semanal para rangos cortos, mensual para el resto (últimos 12 puntos)
    const sparkKey = S.f.to - S.f.from < 120 ? r => weekStart(r.d) : r => monthKey(r.d);
    const months = [...groupBy(S.cur, sparkKey).values()].sort((a, b) => a.key - b.key).slice(-12);
    const defs = [
      { label: 'Ventas netas', val: cmoney(c.rev), full: money(c.rev), cur: c.rev, prev: p && p.rev, spark: months.map(m => m.rev) },
      { label: 'Utilidad bruta', val: cmoney(c.profit), full: money(c.profit), cur: c.profit, prev: p && p.profit, spark: months.map(m => m.profit) },
      { label: 'Margen bruto', val: pct(c.margin), cur: c.margin, prev: p && p.margin, pp: true, spark: months.map(m => m.rev ? m.profit / m.rev : 0) },
      { label: 'Unidades vendidas', val: compact(c.qty), full: int(c.qty), cur: c.qty, prev: p && p.qty, spark: months.map(m => m.qty) },
      { label: 'Transacciones', val: int(c.n), cur: c.n, prev: p && p.n, spark: months.map(m => m.n) },
      { label: 'Ticket promedio', val: money(c.ticket), cur: c.ticket, prev: p && p.ticket, spark: months.map(m => m.n ? m.rev / m.n : 0) },
    ];
    const prevLbl = S.prevRange ? `vs. ${fmtDay(S.prevRange[0])} – ${fmtDay(S.prevRange[1])}${S.prevComplete ? '' : ' (parcial)'}` : '';
    document.getElementById('kpis').innerHTML = defs.map(d => {
      let delta = '<span class="delta flat">Sin periodo previo</span>';
      if (d.prev != null && d.prev !== 0 && c.n) {
        const ch = d.pp ? (d.cur - d.prev) : (d.cur - d.prev) / Math.abs(d.prev);
        const cls = Math.abs(ch) < 0.0005 ? 'flat' : ch > 0 ? 'up' : 'down';
        const arrow = cls === 'up' ? '▲' : cls === 'down' ? '▼' : '■';
        const txt = d.pp ? `${ch >= 0 ? '+' : ''}${(ch * 100).toFixed(1)} pp` : `${ch >= 0 ? '+' : ''}${(ch * 100).toFixed(1)}%`;
        delta = `<span class="delta ${cls}" title="${esc(prevLbl)}">${arrow} ${txt}<small>vs. ant.</small></span>`;
      }
      return `<div class="kpi" title="${esc(prevLbl)}"><div class="kpi-label">${d.label}</div><div class="kpi-value"${d.full ? ` title="${d.full}"` : ''}>${c.n ? d.val : '—'}</div>${d.full && c.n ? `<div class="kpi-full">${d.full}</div>` : ''}<div class="kpi-foot">${delta}${sparkline(d.spark)}</div></div>`;
    }).join('');
  }

  function sparkline(vals) {
    if (vals.length < 2) return '<svg class="spark"></svg>';
    const w = 84, h = 30, pad = 4;
    const min = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
    const pts = vals.map((v, i) => [pad + (i * (w - 2 * pad)) / (vals.length - 1), h - pad - ((v - min) / rng) * (h - 2 * pad)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
    const l = pts[pts.length - 1];
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/><circle cx="${l[0]}" cy="${l[1]}" r="3"/></svg>`;
  }

  // ---------- Tabs ----------
  function setupTabs() {
    document.querySelectorAll('.tab').forEach(t => t.addEventListener('click', () => { S.tab = t.dataset.tab; renderTab(); writeHash(); }));
    document.querySelectorAll('#granSeg button').forEach(b => b.addEventListener('click', () => {
      S.gran = b.dataset.g; renderTrend(); writeHash();
    }));
  }

  function renderTab() {
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', String(t.dataset.tab === S.tab)));
    document.querySelectorAll('.panel').forEach(p => { p.hidden = p.dataset.panel !== S.tab; });
    document.querySelectorAll('#granSeg button').forEach(b => b.classList.toggle('on', b.dataset.g === S.gran));
    if (S.tab === 'resumen') { renderTrend(); renderCategoria(); renderRegion(); renderCanal(); renderDow(); renderHeat(); renderMix(); }
    if (S.tab === 'productos') { renderProductos(); }
    if (S.tab === 'clientes') { renderClientes(); }
    if (S.tab === 'detalle') { tables.detalle.page = 0; tables.detalle.render(); }
    Object.values(charts).forEach(c => c.resize());
  }

  // ---------- ECharts helpers ----------
  function chart(id) {
    if (!charts[id]) {
      const el = document.getElementById(id);
      charts[id] = echarts.init(el, null, { renderer: 'svg' });
      new ResizeObserver(() => charts[id].resize()).observe(el);
    }
    return charts[id];
  }
  function base() {
    return {
      animationDuration: 400, animationDurationUpdate: 300,
      textStyle: { fontFamily: T.font, color: T.ink2 },
      tooltip: {
        confine: true, backgroundColor: T.surface, borderColor: T.border, borderWidth: 1, padding: [8, 12],
        textStyle: { color: T.ink, fontSize: 12.5, fontFamily: T.font },
        extraCssText: 'border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.14);',
      },
    };
  }
  const axisCommon = () => ({
    axisLine: { lineStyle: { color: T.axis } }, axisTick: { show: false },
    axisLabel: { color: T.muted, fontSize: 11.5 }, splitLine: { lineStyle: { color: T.grid } },
  });
  function setChart(id, opt, empty) {
    const c = chart(id);
    if (empty) {
      c.setOption({ ...base(), graphic: { type: 'text', left: 'center', top: 'middle', style: { text: 'Sin datos para los filtros seleccionados', fill: T.muted, font: `13px ${T.font}` } } }, true);
      return c;
    }
    c.setOption(opt, true);
    return c;
  }
  const ttRow = (color, name, value) =>
    `<div style="display:flex;align-items:center;gap:8px;justify-content:space-between;min-width:170px"><span style="display:flex;align-items:center;gap:6px">${color ? `<i style="width:8px;height:8px;border-radius:50%;background:${color};display:inline-block"></i>` : ''}${esc(name)}</span><b style="font-weight:600">${value}</b></div>`;
  const ttHead = t => `<div style="font-weight:600;margin-bottom:4px">${esc(t)}</div>`;

  function hbar(id, items, { key, colorFn, labelFn, tip }) {
    const labelW = Math.max(40, ...items.map(g => labelFn(g).length * 6.6)) + 10;
    const data = items.map(g => ({ value: g.rev, name: g.key, itemStyle: { color: colorFn ? colorFn(g.key) : T.accent, borderRadius: [0, 4, 4, 0] } }));
    const c = setChart(id, {
      ...base(),
      grid: { left: 8, right: labelW, top: 6, bottom: 6, containLabel: true },
      xAxis: { type: 'value', ...axisCommon(), axisLabel: { show: false }, splitLine: { show: false }, axisLine: { show: false } },
      yAxis: { type: 'category', inverse: true, data: items.map(g => g.key), ...axisCommon(), axisLabel: { color: T.ink2, fontSize: 12, width: 130, overflow: 'truncate' }, axisLine: { lineStyle: { color: T.axis } } },
      tooltip: { ...base().tooltip, trigger: 'item', formatter: p => tip(items[p.dataIndex]) },
      series: [{
        type: 'bar', data, barMaxWidth: 22, barCategoryGap: '30%', cursor: key ? 'pointer' : 'default',
        label: { show: true, position: 'right', color: T.ink2, fontSize: 11.5, formatter: p => labelFn(items[p.dataIndex]) },
        emphasis: { focus: 'none', itemStyle: { opacity: .85 } },
      }],
    }, !items.length);
    c.off('click');
    if (key) c.on('click', p => p.name && toggleFilter(key, p.name));
  }

  const stdTip = (total) => g => ttHead(g.key) + ttRow(null, 'Ventas', money(g.rev)) + ttRow(null, 'Participación', pct(g.rev / (total || 1))) +
    ttRow(null, 'Utilidad', money(g.profit)) + ttRow(null, 'Margen', pct(g.rev ? g.profit / g.rev : 0)) + ttRow(null, 'Unidades', int(g.qty));

  // ---------- Resumen ----------
  function buckets() {
    const { from, to } = S.f;
    const out = [];
    if (S.gran === 'day') for (let d = from; d <= to; d++) out.push({ k: d, label: fmtDay(d), axis: `${dateOf(d).getUTCDate()} ${MONTHS[dateOf(d).getUTCMonth()]}` });
    else if (S.gran === 'week') for (let d = weekStart(from); d <= to; d += 7) out.push({ k: d, label: `Semana del ${fmtDay(d)}`, axis: `${dateOf(d).getUTCDate()} ${MONTHS[dateOf(d).getUTCMonth()]}` });
    else for (let m = monthKey(from); m <= monthKey(to); m++) out.push({ k: m, label: fmtMonth(m), axis: fmtMonth(m) });
    return out;
  }

  function renderTrend() {
    const keyFn = S.gran === 'day' ? r => r.d : S.gran === 'week' ? r => weekStart(r.d) : r => monthKey(r.d);
    const g = groupBy(S.cur, keyFn);
    const bs = buckets();
    const lastMonthPartial = S.gran === 'month' && S.f.to < monthStart(monthKey(S.f.to) + 1) - 1;
    const firstMonthPartial = S.gran === 'month' && S.f.from > monthStart(monthKey(S.f.from));
    const rev = bs.map(b => (g.get(b.k) || {}).rev || 0);
    const pro = bs.map(b => (g.get(b.k) || {}).profit || 0);
    const notes = [];
    if (firstMonthPartial || lastMonthPartial) notes.push('meses en los extremos pueden estar incompletos');
    document.getElementById('trendSub').textContent = `MXN por ${S.gran === 'day' ? 'día' : S.gran === 'week' ? 'semana' : 'mes'}${notes.length ? ' · ' + notes.join('') : ''}`;
    const many = bs.length > 60;
    setChart('cTrend', {
      ...base(),
      color: [T.series[0], T.series[2]],
      legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 12, itemHeight: 4, textStyle: { color: T.ink2, fontSize: 12 } },
      grid: { left: 8, right: 16, top: 34, bottom: many ? 44 : 8, containLabel: true },
      tooltip: {
        ...base().tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.axis } },
        formatter: ps => {
          const i = ps[0].dataIndex, b = bs[i];
          const partial = S.gran === 'month' && ((i === bs.length - 1 && lastMonthPartial) || (i === 0 && firstMonthPartial));
          return ttHead(b.label + (partial ? ' (parcial)' : '')) + ttRow(T.series[0], 'Ventas', money(rev[i])) + ttRow(T.series[2], 'Utilidad bruta', money(pro[i])) + ttRow(null, 'Margen', pct(rev[i] ? pro[i] / rev[i] : 0));
        },
      },
      xAxis: { type: 'category', data: bs.map(b => b.axis), boundaryGap: S.gran === 'month', ...axisCommon(), splitLine: { show: false } },
      yAxis: { type: 'value', ...axisCommon(), axisLine: { show: false }, axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => cmoney(v) } },
      dataZoom: many ? [{ type: 'inside' }, { type: 'slider', height: 18, bottom: 6, borderColor: 'transparent', backgroundColor: T.surface2, fillerColor: 'rgba(42,120,214,.12)', dataBackground: { lineStyle: { color: T.axis }, areaStyle: { color: T.grid } }, handleStyle: { color: T.surface, borderColor: T.axis }, textStyle: { color: T.muted }, moveHandleSize: 0 }] : [],
      series: [
        { name: 'Ventas', type: 'line', data: rev, smooth: 0.25, symbol: 'circle', symbolSize: 8, showSymbol: bs.length <= 30, lineStyle: { width: 2 }, itemStyle: { borderColor: T.surface, borderWidth: 2 }, areaStyle: { opacity: 0.10 } },
        { name: 'Utilidad bruta', type: 'line', data: pro, smooth: 0.25, symbol: 'circle', symbolSize: 8, showSymbol: bs.length <= 30, lineStyle: { width: 2 }, itemStyle: { borderColor: T.surface, borderWidth: 2 } },
      ],
    }, !S.cur.length);
  }

  function sortedGroups(rows, key) { return [...groupBy(rows, key).values()].sort((a, b) => b.rev - a.rev); }

  function renderCategoria() {
    const items = sortedGroups(S.cur, 'categoria'), tot = totals(S.cur).rev;
    hbar('cCategoria', items, { key: 'categoria', colorFn: v => colorOf('categoria', v), labelFn: g => `${cmoney(g.rev)}  ·  ${pct(g.rev ? g.profit / g.rev : 0)}`, tip: stdTip(tot) });
  }
  function renderRegion() {
    const items = sortedGroups(S.cur, 'region'), tot = totals(S.cur).rev;
    hbar('cRegion', items, { key: 'region', labelFn: g => `${cmoney(g.rev)}  ·  ${pct(g.rev / (tot || 1), 0)}`, tip: stdTip(tot) });
  }
  function renderCanal() {
    const items = sortedGroups(S.cur, 'canal'), tot = totals(S.cur).rev;
    hbar('cCanal', items, { key: 'canal', labelFn: g => `${cmoney(g.rev)}  ·  ${pct(g.rev / (tot || 1), 0)}`, tip: stdTip(tot) });
  }

  function renderDow() {
    const g = groupBy(S.cur, r => dowOf(r.d));
    const daysCount = Array(7).fill(0);
    for (let d = S.f.from; d <= S.f.to; d++) daysCount[dowOf(d)]++;
    const vals = DOW.map((_, i) => ((g.get(i) || {}).rev || 0) / (daysCount[i] || 1));
    const max = Math.max(...vals);
    setChart('cDow', {
      ...base(),
      grid: { left: 8, right: 8, top: 22, bottom: 4, containLabel: true },
      tooltip: { ...base().tooltip, trigger: 'item', formatter: p => ttHead(['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'][p.dataIndex]) + ttRow(null, 'Venta promedio diaria', money(vals[p.dataIndex])) + ttRow(null, 'Días en el periodo', daysCount[p.dataIndex]) },
      xAxis: { type: 'category', data: DOW, ...axisCommon(), splitLine: { show: false } },
      yAxis: { type: 'value', min: 0, ...axisCommon(), axisLine: { show: false }, axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => cmoney(v) } },
      series: [{
        type: 'bar', barMaxWidth: 24, data: vals.map(v => ({ value: v, itemStyle: { color: v === max ? T.accent : T.seq[1], borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', color: T.ink2, fontSize: 11, formatter: p => cmoney(p.value) },
      }],
    }, !S.cur.length);
  }

  function renderHeat() {
    const regs = S.values.region.filter(v => !S.f.region.size || S.f.region.has(v));
    const cats = S.values.categoria.filter(v => !S.f.categoria.size || S.f.categoria.has(v));
    const g = groupBy(S.cur, r => r.region + '|' + r.categoria);
    const data = [];
    let max = 0;
    regs.forEach((rg, y) => cats.forEach((ct, x) => { const v = (g.get(rg + '|' + ct) || {}).rev || 0; max = Math.max(max, v); data.push([x, y, v]); }));
    const c = setChart('cHeat', {
      ...base(),
      grid: { left: 8, right: 8, top: 4, bottom: 40, containLabel: true },
      tooltip: { ...base().tooltip, trigger: 'item', formatter: p => { const gg = g.get(regs[p.value[1]] + '|' + cats[p.value[0]]) || { rev: 0, profit: 0 }; return ttHead(`${regs[p.value[1]]} · ${cats[p.value[0]]}`) + ttRow(null, 'Ventas', money(gg.rev)) + ttRow(null, 'Margen', pct(gg.rev ? gg.profit / gg.rev : 0)); } },
      xAxis: { type: 'category', data: cats, ...axisCommon(), axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5, interval: 0, width: 90, overflow: 'truncate' } },
      yAxis: { type: 'category', data: regs, ...axisCommon(), axisLine: { show: false }, splitLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 12 } },
      visualMap: { min: 0, max: max || 1, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, itemWidth: 10, itemHeight: 140, text: [cmoney(max), '$0'], textStyle: { color: T.muted, fontSize: 11 }, inRange: { color: T.seq } },
      series: [{
        type: 'heatmap', data, cursor: 'pointer',
        itemStyle: { borderColor: T.surface, borderWidth: 2, borderRadius: 4 },
        label: { show: true, fontSize: 11, formatter: p => cmoney(p.value[2]), color: T.ink },
        emphasis: { itemStyle: { borderColor: T.ink, borderWidth: 1 } },
      }],
    }, !S.cur.length);
    // Contraste de etiquetas según el fondo de la celda
    if (S.cur.length) {
      const dark = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches);
      c.setOption({ series: [{ data: data.map(d => ({ value: d, label: { color: d[2] / (max || 1) > 0.5 ? (dark ? '#0b0b0b' : '#fff') : T.ink } })) }] });
    }
    c.off('click');
    c.on('click', p => { S.f.region = new Set([regs[p.value[1]]]); S.f.categoria = new Set([cats[p.value[0]]]); pruneProducts(); update(); });
  }

  function renderMix() {
    const canals = S.values.canal.filter(v => !S.f.canal.size || S.f.canal.has(v));
    const months = []; for (let m = monthKey(S.f.from); m <= monthKey(S.f.to); m++) months.push(m);
    const g = groupBy(S.cur, r => monthKey(r.d) + '|' + r.canal);
    const totM = months.map(m => canals.reduce((a, c) => a + ((g.get(m + '|' + c) || {}).rev || 0), 0));
    setChart('cMix', {
      ...base(),
      legend: { top: 0, left: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: T.ink2, fontSize: 12 } },
      grid: { left: 8, right: 8, top: 32, bottom: 4, containLabel: true },
      tooltip: { ...base().tooltip, trigger: 'axis', axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(127,127,127,.08)' } },
        formatter: ps => ttHead(fmtMonth(months[ps[0].dataIndex])) + ps.slice().reverse().map(p => ttRow(p.color, p.seriesName, `${pct(p.value / 100)} · ${cmoney((g.get(months[p.dataIndex] + '|' + p.seriesName) || {}).rev || 0)}`)).join('') },
      xAxis: { type: 'category', data: months.map(fmtMonth), ...axisCommon(), splitLine: { show: false } },
      yAxis: { type: 'value', max: 100, ...axisCommon(), axisLine: { show: false }, axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => v + '%' } },
      series: canals.map(c => ({
        name: c, type: 'bar', stack: 'mix', barMaxWidth: 24, cursor: 'pointer',
        itemStyle: { color: colorOf('canal', c), borderColor: T.surface, borderWidth: 1 },
        data: months.map((m, i) => totM[i] ? +(((g.get(m + '|' + c) || {}).rev || 0) / totM[i] * 100).toFixed(2) : 0),
      })),
    }, !S.cur.length).off('click');
    chart('cMix').on('click', p => toggleFilter('canal', p.seriesName));
  }

  // ---------- Productos ----------
  function productStats() {
    const cur = groupBy(S.cur, 'producto'), prev = groupBy(S.prev, 'producto');
    const tot = totals(S.cur).rev || 1;
    return [...cur.values()].map(g => {
      const p = prev.get(g.key);
      return { ...g, producto: g.key, categoria: S.prodCat[g.key], share: g.rev / tot, margin: g.rev ? g.profit / g.rev : 0,
        avgPrice: g.qty ? g.rev / g.qty : 0, delta: p && p.rev && S.prevComplete ? (g.rev - p.rev) / p.rev : null };
    });
  }

  function renderProductos() {
    const stats = productStats();
    tables.productos.setRows(stats);
    const maxShare = Math.max(0, ...stats.map(s => s.share));
    tables.productos.maxShare = maxShare;
    tables.productos.render();

    const cats = S.values.categoria.filter(c => stats.some(s => s.categoria === c));
    const sc = setChart('cScatter', {
      ...base(),
      legend: { top: 0, left: 0, icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: T.ink2, fontSize: 12 } },
      grid: { left: 8, right: 20, top: 36, bottom: 26, containLabel: true },
      tooltip: { ...base().tooltip, trigger: 'item', formatter: p => { const s = p.data.s; return ttHead(s.producto) + ttRow(p.color, s.categoria, '') + ttRow(null, 'Ventas', money(s.rev)) + ttRow(null, 'Margen', pct(s.margin)) + ttRow(null, 'Unidades', int(s.qty)) + ttRow(null, 'Precio promedio', money2(s.avgPrice)); } },
      xAxis: { type: 'value', name: 'Ventas', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: T.muted, fontSize: 11.5 }, ...axisCommon(), axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => cmoney(v) }, scale: true },
      yAxis: { type: 'value', ...axisCommon(), axisLine: { show: false }, axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => (v * 100).toFixed(0) + '%' }, scale: true },
      series: cats.map(c => ({
        name: c, type: 'scatter', symbolSize: 13, cursor: 'pointer',
        itemStyle: { color: colorOf('categoria', c), borderColor: T.surface, borderWidth: 2 },
        emphasis: { scale: 1.4, label: { show: true } },
        label: { show: false, position: 'top', color: T.ink, fontSize: 11, formatter: p => p.data.s.producto },
        data: stats.filter(s => s.categoria === c).map(s => ({ value: [s.rev, s.margin], s })),
      })),
    }, !stats.length);
    sc.off('click'); sc.on('click', p => p.data && toggleFilter('producto', p.data.s.producto));

    const tot = totals(S.cur).rev;
    const cat = sortedGroups(S.cur, 'categoria').map(g => ({ ...g, m: g.rev ? g.profit / g.rev : 0 })).sort((a, b) => b.m - a.m);
    const mc = setChart('cMargenCat', {
      ...base(),
      grid: { left: 8, right: 8, top: 22, bottom: 4, containLabel: true },
      tooltip: { ...base().tooltip, trigger: 'item', formatter: p => stdTip(tot)(cat[p.dataIndex]) },
      xAxis: { type: 'category', data: cat.map(c => c.key), ...axisCommon(), splitLine: { show: false }, axisLabel: { color: T.ink2, fontSize: 11.5, interval: 0 } },
      yAxis: { type: 'value', ...axisCommon(), axisLine: { show: false }, axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => (v * 100).toFixed(0) + '%' } },
      series: [{ type: 'bar', barMaxWidth: 24, cursor: 'pointer',
        data: cat.map(c => ({ value: c.m, name: c.key, itemStyle: { color: colorOf('categoria', c.key), borderRadius: [4, 4, 0, 0] } })),
        label: { show: true, position: 'top', color: T.ink2, fontSize: 11.5, formatter: p => pct(p.value) } }],
    }, !cat.length);
    mc.off('click'); mc.on('click', p => toggleFilter('categoria', p.name));
  }

  // ---------- Clientes ----------
  function clientStats() {
    const m = new Map();
    for (const r of S.cur) {
      let g = m.get(r.cliente);
      if (!g) { g = { cliente: r.cliente, key: r.cliente, rev: 0, profit: 0, qty: 0, n: 0, last: 0, regs: {} }; m.set(r.cliente, g); }
      g.rev += r.rev; g.profit += r.profit; g.qty += r.qty; g.n++; if (r.d > g.last) g.last = r.d;
      g.regs[r.region] = (g.regs[r.region] || 0) + r.rev;
    }
    const tot = totals(S.cur).rev || 1;
    return [...m.values()].map(g => ({ ...g, share: g.rev / tot, margin: g.rev ? g.profit / g.rev : 0, ticket: g.rev / g.n,
      region: Object.entries(g.regs).sort((a, b) => b[1] - a[1])[0][0] }));
  }

  function renderClientes() {
    const stats = clientStats().sort((a, b) => b.rev - a.rev);
    const tot = totals(S.cur).rev;
    hbar('cTopCli', stats.slice(0, 15), { key: 'cliente', labelFn: g => `${cmoney(g.rev)}  ·  ${pct(g.share, 1)}`, tip: stdTip(tot) });

    let acc = 0;
    const curve = [[0, 0]].concat(stats.map((s, i) => { acc += s.rev; return [((i + 1) / stats.length) * 100, (acc / (tot || 1)) * 100]; }));
    const top20 = curve.find(p => p[0] >= 20 - 1e-9);
    const top10n = stats.slice(0, 10).reduce((a, s) => a + s.rev, 0) / (tot || 1);
    document.getElementById('concSub').textContent = stats.length
      ? `El 20% de los clientes genera ${top20 ? top20[1].toFixed(0) : 100}% de las ventas · Top 10: ${pct(top10n, 0)}`
      : '% acumulado de ventas por clientes ordenados';
    setChart('cConc', {
      ...base(),
      grid: { left: 8, right: 16, top: 16, bottom: 26, containLabel: true },
      tooltip: { ...base().tooltip, trigger: 'axis', axisPointer: { type: 'line', lineStyle: { color: T.axis } },
        formatter: ps => { const i = ps[0].dataIndex; if (!i) return ''; return ttHead(`Top ${i} cliente${i > 1 ? 's' : ''} (${curve[i][0].toFixed(1)}% del total)`) + ttRow(null, 'Ventas acumuladas', pct(curve[i][1] / 100)) + ttRow(null, 'Último agregado', esc(stats[i - 1].cliente)); } },
      xAxis: { type: 'value', min: 0, max: 100, name: '% de clientes', nameLocation: 'middle', nameGap: 26, nameTextStyle: { color: T.muted, fontSize: 11.5 }, ...axisCommon(), axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => v + '%' } },
      yAxis: { type: 'value', min: 0, max: 100, ...axisCommon(), axisLine: { show: false }, axisLabel: { color: T.muted, fontSize: 11.5, formatter: v => v + '%' } },
      series: [
        { type: 'line', data: curve, showSymbol: false, lineStyle: { width: 2, color: T.accent }, itemStyle: { color: T.accent }, areaStyle: { color: T.accent, opacity: 0.10 },
          markLine: { silent: true, symbol: 'none', lineStyle: { color: T.axis, type: 'solid', width: 1 }, label: { show: false }, data: [[{ coord: [0, 0] }, { coord: [100, 100] }]] } },
      ],
    }, !stats.length);

    document.getElementById('cliSub').textContent = `${int(stats.length)} clientes activos en el periodo`;
    tables.clientes.setRows(stats);
    tables.clientes.render();
  }

  // ---------- Tablas ----------
  class DataTable {
    constructor(el, { columns, pageSize = 15, sort, dir = -1, onRow, searchEl, searchFn, rowsFn }) {
      Object.assign(this, { el, columns, pageSize, sort, dir, onRow, searchFn, rowsFn, page: 0, rows: [], q: '' });
      if (searchEl) searchEl.addEventListener('input', () => { this.q = searchEl.value.trim().toLowerCase(); this.page = 0; this.render(); });
      el.addEventListener('click', e => {
        const th = e.target.closest('th[data-k]');
        if (th) { const k = th.dataset.k; if (this.sort === k) this.dir *= -1; else { this.sort = k; this.dir = this.columns.find(c => c.k === k).num ? -1 : 1; } this.page = 0; this.render(); return; }
        const pb = e.target.closest('[data-p]');
        if (pb) { this.page = +pb.dataset.p; this.render(); return; }
        const tr = e.target.closest('tr[data-i]');
        if (tr && this.onRow) this.onRow(this.view[+tr.dataset.i]);
      });
    }
    setRows(r) { this.rows = r; }
    render() {
      let rows = this.rowsFn ? this.rowsFn() : this.rows;
      if (this.q && this.searchFn) rows = rows.filter(r => this.searchFn(r).includes(this.q));
      const col = this.columns.find(c => c.k === this.sort);
      if (col) {
        const get = col.sortVal || (r => r[col.k]);
        rows = rows.slice().sort((a, b) => { const x = get(a), y = get(b); return (x == null) - (y == null) || (typeof x === 'string' ? x.localeCompare(y, 'es') : x - y) * this.dir; });
      }
      const pages = Math.max(1, Math.ceil(rows.length / this.pageSize));
      this.page = Math.min(this.page, pages - 1);
      const view = this.view = rows.slice(this.page * this.pageSize, (this.page + 1) * this.pageSize);
      const head = this.columns.map(c => `<th data-k="${c.k}" class="${c.num ? 'num' : ''}" aria-sort="${this.sort === c.k ? (this.dir > 0 ? 'ascending' : 'descending') : 'none'}">${c.label}<span class="arrow">${this.sort === c.k ? (this.dir > 0 ? '↑' : '↓') : ''}</span></th>`).join('');
      const body = view.length ? view.map((r, i) => `<tr data-i="${i}" class="${this.onRow ? 'clickable' : ''}">${this.columns.map(c => `<td class="${c.num ? 'num' : ''}">${c.fmt ? c.fmt(r, this) : esc(r[c.k])}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${this.columns.length}" class="dt-empty">Sin registros para los filtros seleccionados</td></tr>`;
      const from = rows.length ? this.page * this.pageSize + 1 : 0, to = Math.min(rows.length, (this.page + 1) * this.pageSize);
      const pager = rows.length > this.pageSize ? `<div class="pager"><span>${int(from)}–${int(to)} de ${int(rows.length)}</span><div class="pager-btns">
          <button data-p="0" ${this.page === 0 ? 'disabled' : ''} aria-label="Primera">«</button>
          <button data-p="${this.page - 1}" ${this.page === 0 ? 'disabled' : ''} aria-label="Anterior">‹</button>
          <span class="page-no">Página ${this.page + 1} de ${int(pages)}</span>
          <button data-p="${this.page + 1}" ${this.page >= pages - 1 ? 'disabled' : ''} aria-label="Siguiente">›</button>
          <button data-p="${pages - 1}" ${this.page >= pages - 1 ? 'disabled' : ''} aria-label="Última">»</button></div></div>` : '';
      this.el.innerHTML = `<table class="dt"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>${pager}`;
      if (this.afterRender) this.afterRender(rows);
    }
  }

  const dot = (dim, v) => `<span class="dot" style="background:${colorOf(dim, v)}"></span>`;
  const deltaFmt = v => v == null ? '<span class="muted">—</span>' : `<span class="${v >= 0 ? 'pos' : 'neg'}">${v >= 0 ? '▲' : '▼'} ${Math.abs(v * 100).toFixed(1)}%</span>`;

  function setupTables() {
    tables.productos = new DataTable(document.getElementById('tProductos'), {
      sort: 'rev', pageSize: 25, onRow: r => toggleFilter('producto', r.producto),
      searchEl: document.getElementById('qProductos'), searchFn: r => (r.producto + ' ' + r.categoria).toLowerCase(),
      columns: [
        { k: 'producto', label: 'Producto', fmt: r => dot('categoria', r.categoria) + esc(r.producto) },
        { k: 'categoria', label: 'Categoría', fmt: r => `<span class="muted">${esc(r.categoria)}</span>` },
        { k: 'rev', label: 'Ventas', num: true, fmt: (r, t) => `<div class="bar-cell">${money(r.rev)}<span class="bar"><i style="width:${(r.share / (t.maxShare || 1)) * 100}%"></i></span></div>` },
        { k: 'share', label: 'Part.', num: true, fmt: r => pct(r.share) },
        { k: 'qty', label: 'Unidades', num: true, fmt: r => int(r.qty) },
        { k: 'avgPrice', label: 'Precio prom.', num: true, fmt: r => money2(r.avgPrice) },
        { k: 'profit', label: 'Utilidad', num: true, fmt: r => money(r.profit) },
        { k: 'margin', label: 'Margen', num: true, fmt: r => pct(r.margin) },
        { k: 'n', label: 'Transacciones', num: true, fmt: r => int(r.n) },
        { k: 'delta', label: 'Var.', num: true, fmt: r => deltaFmt(r.delta) },
      ],
    });
    tables.clientes = new DataTable(document.getElementById('tClientes'), {
      sort: 'rev', pageSize: 15, onRow: r => toggleFilter('cliente', r.cliente),
      searchEl: document.getElementById('qClientes'), searchFn: r => r.cliente.toLowerCase(),
      columns: [
        { k: 'rank', label: '#', num: true, sortVal: r => -r.rev, fmt: r => `<span class="muted">${r.rank}</span>` },
        { k: 'cliente', label: 'Cliente', fmt: r => `<b style="font-weight:500">${esc(r.cliente)}</b>` },
        { k: 'region', label: 'Región principal', fmt: r => esc(r.region) },
        { k: 'rev', label: 'Ventas', num: true, fmt: r => money(r.rev) },
        { k: 'share', label: 'Part.', num: true, fmt: r => pct(r.share, 2) },
        { k: 'profit', label: 'Utilidad', num: true, fmt: r => money(r.profit) },
        { k: 'margin', label: 'Margen', num: true, fmt: r => pct(r.margin) },
        { k: 'n', label: 'Transacciones', num: true, fmt: r => int(r.n) },
        { k: 'ticket', label: 'Ticket prom.', num: true, fmt: r => money(r.ticket) },
        { k: 'last', label: 'Última compra', num: true, fmt: r => fmtDay(r.last) },
      ],
    });
    const origSet = tables.clientes.setRows.bind(tables.clientes);
    tables.clientes.setRows = rows => { rows.forEach((r, i) => { r.rank = i + 1; }); origSet(rows); };

    tables.detalle = new DataTable(document.getElementById('tDetalle'), {
      sort: 'd', dir: -1, pageSize: 25,
      rowsFn: () => S.cur,
      searchEl: document.getElementById('qDetalle'),
      searchFn: r => (r._s || (r._s = `${r.producto} ${r.cliente} ${r.region} ${r.canal} ${r.categoria} ${r.fecha}`.toLowerCase())),
      columns: [
        { k: 'd', label: 'Fecha', fmt: r => fmtDay(r.d) },
        { k: 'region', label: 'Región' },
        { k: 'categoria', label: 'Categoría', fmt: r => dot('categoria', r.categoria) + esc(r.categoria) },
        { k: 'producto', label: 'Producto' },
        { k: 'canal', label: 'Canal' },
        { k: 'cliente', label: 'Cliente' },
        { k: 'qty', label: 'Cantidad', num: true, fmt: r => int(r.qty) },
        { k: 'price', label: 'Precio', num: true, fmt: r => money2(r.price) },
        { k: 'cost', label: 'Costo', num: true, fmt: r => money2(r.cost) },
        { k: 'rev', label: 'Venta', num: true, fmt: r => money2(r.rev) },
        { k: 'profit', label: 'Utilidad', num: true, fmt: r => money2(r.profit) },
        { k: 'margin', label: 'Margen', num: true, sortVal: r => r.profit / r.rev, fmt: r => pct(r.profit / r.rev) },
      ],
    });
    tables.detalle.afterRender = rows => {
      const t = totals(rows);
      document.getElementById('detSub').textContent = `${int(rows.length)} registros · ${money(t.rev)} en ventas · margen ${pct(t.margin)}`;
    };
  }

  // ---------- Exportar, tema, hash ----------
  function setupMisc() {
    document.getElementById('btnExport').addEventListener('click', () => {
      const cols = ['fecha', 'region', 'categoria', 'producto', 'canal', 'cliente', 'cantidad', 'precio_unitario', 'costo_unitario', 'venta', 'utilidad'];
      const q = v => /[",\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v;
      const lines = [cols.join(',')].concat(S.cur.map(r => [r.fecha, r.region, r.categoria, r.producto, r.canal, r.cliente, r.qty, r.price, r.cost, r.rev.toFixed(2), r.profit.toFixed(2)].map(q).join(',')));
      const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `ventas_filtradas_${iso(S.f.from)}_${iso(S.f.to)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });

    document.getElementById('btnTheme').addEventListener('click', () => {
      const root = document.documentElement;
      const isDark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
      root.dataset.theme = isDark ? 'light' : 'dark';
      try { localStorage.setItem('dash-theme', root.dataset.theme); } catch (e) {}
      readTheme(); renderKPIs(); renderTab(); refreshFilterControls();
    });
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!document.documentElement.dataset.theme) { readTheme(); renderTab(); } });

    window.addEventListener('hashchange', () => { if (location.hash !== lastHash) { readHash(); update(); } });
  }

  let lastHash = '';
  function writeHash() {
    const p = new URLSearchParams();
    if (S.tab !== 'resumen') p.set('tab', S.tab);
    if (S.gran !== 'month') p.set('g', S.gran);
    if (S.f.preset === 'custom') { p.set('desde', iso(S.f.from)); p.set('hasta', iso(S.f.to)); }
    else if (S.f.preset !== 'all') p.set('periodo', S.f.preset);
    for (const k of DIMS) if (S.f[k].size) p.set(k, [...S.f[k]].join('~'));
    const h = p.toString() ? '#' + p.toString() : '';
    lastHash = h;
    if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    S.tab = ['resumen', 'productos', 'clientes', 'detalle'].includes(p.get('tab')) ? p.get('tab') : 'resumen';
    S.gran = ['day', 'week', 'month'].includes(p.get('g')) ? p.get('g') : 'month';
    if (p.get('desde') && p.get('hasta')) {
      S.f.preset = 'custom';
      S.f.from = Math.max(S.minDay, toDay(p.get('desde')) || S.minDay);
      S.f.to = Math.min(S.maxDay, toDay(p.get('hasta')) || S.maxDay);
    } else S.f.preset = p.get('periodo') || 'all';
    for (const k of DIMS) {
      S.f[k] = new Set((p.get(k) || '').split('~').filter(v => S.values[k].includes(v)));
    }
  }
})();
