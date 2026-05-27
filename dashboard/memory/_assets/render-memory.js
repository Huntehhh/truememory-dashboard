/* render-memory.js — shared helpers for the Memory tab of the TrueMemory dashboard.
 * Vanilla JS. Pulls live data from the Express server (same origin).
 * Renders Plotly charts in the Observatory v2 warm-paper palette.
 *
 * Each page imports this with <script src="_assets/render-memory.js"></script>
 * after Plotly, then calls the relevant render* function(s) on window.GTBM.
 */

const API_BASE = ''; // same-origin: dashboard is served by the Express server

// Signal-lane palette — matches styles-observatory.css
const PALETTE = {
  paper:    '#faf6f0',
  paperMid: '#f3ecdf',
  paperDim: '#ebe2cf',
  ink:      '#2a2a2a',
  inkMid:   '#5a5a5a',
  inkDim:   '#888888',
  teal:     '#1d6e6e',
  tealDim:  '#3a9090',
  terra:    '#b85c2a',
  gold:     '#c89211',
  auber:    '#8e3d6f',
  slate:    '#4a6e7e',
  goodGrn:  '#5a7a3a',
  warnRed:  '#a13e2a',
  navy:     '#2a3a5e',
};

// Default memory categories
const LANE_FOR_CATEGORY = {
  engineering: PALETTE.slate,
  project:     PALETTE.teal,
  feedback:    PALETTE.auber,
  reference:   PALETTE.gold,
  preference:  PALETTE.terra,
  unknown:     PALETTE.inkDim,
};

/* ---------- fetch helpers ---------- */

async function fetchJson(path) {
  const url = path.startsWith('http') ? path : API_BASE + path;
  try {
    const r = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const body = await r.json();
    // Server wraps every response in { data: [...] | {...}, ...meta }.
    // Unwrap automatically.
    if (body && typeof body === 'object' && 'data' in body) return body.data;
    return body;
  } catch (err) {
    console.error('[render-memory] fetch failed:', url, err);
    return null;
  }
}

/* ---------- formatters ---------- */

const fmtNum = (v) => {
  if (v == null) return '—';
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (v >= 10_000) return (v / 1000).toFixed(0) + 'K';
  if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
  return v.toLocaleString();
};

const fmtPct = (v) => {
  if (v == null) return '—';
  return (v * 100).toFixed(1) + '%';
};

const fmtScore = (v) => {
  if (v == null) return '—';
  return Number(v).toFixed(2);
};

const fmtTs = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const fmtAge = (iso) => {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const days = Math.floor(ms / 86400000);
  if (days < 1) return '< 1d';
  if (days < 30) return days + 'd';
  if (days < 365) return Math.floor(days / 30) + 'mo';
  return Math.floor(days / 365) + 'y';
};

const truncate = (s, n) => {
  if (!s) return '';
  return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
};

/* ---------- Plotly layout helpers ---------- */

const baseLayout = (extra = {}) => ({
  paper_bgcolor: PALETTE.paper,
  plot_bgcolor:  PALETTE.paper,
  font: { family: '"DM Mono", monospace', size: 11, color: PALETTE.ink },
  margin: { l: 50, r: 20, t: 24, b: 40 },
  hoverlabel: { bgcolor: PALETTE.paper, bordercolor: PALETTE.teal, font: { family: '"DM Mono", monospace', size: 11 } },
  ...extra,
});

const baseAxis = (extra = {}) => ({
  gridcolor: PALETTE.paperDim,
  zerolinecolor: PALETTE.paperDim,
  linecolor: PALETTE.inkDim,
  tickfont: { family: '"DM Mono", monospace', size: 10, color: PALETTE.inkMid },
  ...extra,
});

const plotlyConfig = { displayModeBar: false, responsive: true };

/* ---------- skeleton + empty states ---------- */

function showLoading(el) {
  if (!el) return;
  el.innerHTML = '<div class="loading-skel"><span class="loading-dot"></span><span class="loading-dot"></span><span class="loading-dot"></span></div>';
}

function showEmpty(el, msg) {
  if (!el) return;
  el.innerHTML = '<div class="empty-state"><span class="empty-icon">∅</span><span class="empty-msg">' + (msg || 'no data yet') + '</span></div>';
}

function showError(el, msg) {
  if (!el) return;
  el.innerHTML = '<div class="error-state"><span class="error-icon">!</span><span class="error-msg">' + (msg || 'failed to load') + '</span></div>';
}

/* ---------- click-to-copy helper ---------- */

function copyToClipboard(el, text) {
  if (!navigator.clipboard) return;
  navigator.clipboard.writeText(text).then(() => {
    const hint = document.createElement('span');
    hint.className = 'copy-hint';
    hint.textContent = '✓ copied';
    el.appendChild(hint);
    setTimeout(() => hint.remove(), 1600);
  }).catch(() => {});
}

function attachCopyHandlers(root) {
  if (!root) return;
  root.querySelectorAll('[data-copy]').forEach(el => {
    if (el.__copyBound) return;
    el.__copyBound = true;
    el.addEventListener('click', (e) => {
      e.preventDefault();
      copyToClipboard(el, el.dataset.copy);
    });
    el.style.cursor = 'pointer';
    el.title = 'click to copy';
  });
}

/* ---------- KPI strip ---------- */

async function renderMemoryKpiStrip(el) {
  showLoading(el);
  const data = await fetchJson('/api/memory/kpi');
  if (!data) return showError(el, 'memory kpi endpoint unreachable');
  const cells = [
    {
      label: 'Total memories',
      value: fmtNum(data.total_memories),
      delta: data.added_this_week != null ? '+' + fmtNum(data.added_this_week) + ' this week' : '',
    },
    {
      label: 'Gate pass rate',
      value: data.gate_pass_rate != null ? (data.gate_pass_rate * 100).toFixed(1) + '%' : '—',
      delta: data.gate_pass_rate_delta_pts != null
        ? (data.gate_pass_rate_delta_pts >= 0 ? '+' : '') + data.gate_pass_rate_delta_pts.toFixed(0) + 'pts vs prior'
        : '',
    },
    {
      label: 'Retrieved (7d)',
      value: fmtNum(data.retrieved_7d),
      delta: 'memory_returned events',
    },
    {
      label: 'Growth (7d)',
      value: data.growth_pct_7d != null ? (data.growth_pct_7d >= 0 ? '+' : '') + (data.growth_pct_7d * 100).toFixed(1) + '%' : '—',
      delta: data.corpus_size_mb != null ? data.corpus_size_mb.toFixed(1) + ' MB on disk' : '',
    },
  ];
  el.innerHTML = cells.map(c => `
    <div class="kpi-cell">
      <span class="label">${c.label}</span>
      <span class="value">${c.value}</span>
      <span class="delta ${(c.delta || '').startsWith('+') ? 'up' : (c.delta || '').startsWith('-') ? 'down' : 'flat'}">${c.delta || ''}</span>
    </div>
  `).join('');
}

/* ---------- activity heatmap (12 weeks × 7 days) ---------- */

async function renderMemoryActivityHeatmap(el) {
  showLoading(el);
  const rows = await fetchJson('/api/memory/activity?days=84');
  if (!rows) return showError(el, 'activity endpoint unreachable');
  if (!Array.isArray(rows) || rows.length === 0) return showEmpty(el, 'no retrieval events yet');

  // Bucket into 12 weeks × 7 days
  const byDate = new Map(rows.map(r => [(r.day || '').slice(0, 10), Number(r.count) || 0]));
  const today = new Date();
  const cells = [];
  const xLabels = [];
  for (let w = 11; w >= 0; w--) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - (w * 7 + today.getDay()));
    xLabels.push(weekStart.toISOString().slice(5, 10));
    const wk = [];
    for (let d = 0; d < 7; d++) {
      const dt = new Date(weekStart);
      dt.setDate(weekStart.getDate() + d);
      wk.push(byDate.get(dt.toISOString().slice(0, 10)) || 0);
    }
    cells.push(wk);
  }
  // Transpose: rows = days of week, cols = weeks
  const z = [0, 1, 2, 3, 4, 5, 6].map(d => cells.map(wk => wk[d]));
  const yLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  Plotly.newPlot(el, [{
    type: 'heatmap',
    z,
    x: xLabels,
    y: yLabels,
    colorscale: [
      [0,   PALETTE.paperMid],
      [0.25,'#e8d4b8'],
      [0.55,'#c8a878'],
      [0.80, PALETTE.teal],
      [1,   '#0a3838'],
    ],
    hovertemplate: 'week of %{x}<br>%{y}<br>%{z} retrievals<extra></extra>',
    showscale: false,
    xgap: 2, ygap: 2,
  }], baseLayout({
    height: 220,
    xaxis: baseAxis({ side: 'top', tickfont: { family: '"DM Mono", monospace', size: 9, color: PALETTE.inkMid } }),
    yaxis: baseAxis({ tickfont: { family: '"DM Mono", monospace', size: 9, color: PALETTE.inkMid } }),
    margin: { l: 40, r: 20, t: 30, b: 20 },
  }), plotlyConfig);
}

/* ---------- category chip bar ---------- */

/**
 * renderCategoryChips(el, onChange)
 *
 * Fetches /api/memory/feed-categories, builds an archival chip bar, and calls
 * onChange(category | null) whenever a chip is clicked.
 *
 * - "All" chip is always first.
 * - Each chip shows: `<category> · <count>` in DM Mono.
 * - Active chip: teal fill + paper text.
 * - Inactive chip: paper-mid bg + ink text with warm hover lift.
 * - Returns the DOM section so the caller can position it.
 */
async function renderCategoryChips(el, onChange) {
  // Skeleton state while fetching
  el.innerHTML = `
    <div class="category-chip-bar" id="chip-bar-inner">
      <span class="cat-chip-skeleton"></span>
      <span class="cat-chip-skeleton" style="width:64px"></span>
      <span class="cat-chip-skeleton" style="width:96px"></span>
    </div>`;

  const cats = await fetchJson('/api/memory/feed-categories');

  const bar = el.querySelector('#chip-bar-inner') || el;
  bar.innerHTML = '<span class="category-chip-bar-label">filter</span>';

  // Determine initial selection from URL ?category= param
  const urlParams = new URLSearchParams(window.location.search);
  const initialCat = urlParams.get('category') || 'all';

  // Build "All" chip first
  const allChip = document.createElement('button');
  allChip.type = 'button';
  allChip.className = 'cat-filter-chip' + (initialCat === 'all' ? ' active' : '');
  allChip.dataset.cat = 'all';
  allChip.innerHTML = 'all';
  bar.appendChild(allChip);

  // Build one chip per category
  if (Array.isArray(cats)) {
    cats.forEach(({ category, count }) => {
      if (!category) return;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'cat-filter-chip' + (category === initialCat ? ' active' : '');
      chip.dataset.cat = category;
      chip.innerHTML = escapeHtml(category) + ' <span class="chip-count">· ' + (count || 0) + '</span>';
      bar.appendChild(chip);
    });
  }

  // Click handler — single-select
  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-filter-chip');
    if (!chip) return;
    const cat = chip.dataset.cat;

    // Deactivate all chips, activate clicked one
    bar.querySelectorAll('.cat-filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    // Push to URL for shareability
    const params = new URLSearchParams(window.location.search);
    if (cat === 'all') {
      params.delete('category');
    } else {
      params.set('category', cat);
    }
    const newUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    history.replaceState(null, '', newUrl);

    onChange(cat === 'all' ? null : cat);
  });
}

/* ---------- memory feed table ---------- */

/**
 * renderMemoryFeed(el, limit, category?)
 *
 * Fetches /api/memory/feed with optional ?category= filter.
 * category=null or undefined → fetch all.
 */
async function renderMemoryFeed(el, limit, category) {
  showLoading(el);
  let url = '/api/memory/feed?limit=' + (limit || 200);
  if (category && category !== 'all') url += '&category=' + encodeURIComponent(category);
  const rows = await fetchJson(url);
  if (!rows) return showError(el, 'feed endpoint unreachable');
  if (!Array.isArray(rows) || rows.length === 0) return showEmpty(el, 'no memories yet');

  const tbody = rows.map(r => {
    const id = r.id != null ? r.id : '—';
    const ts = fmtTs(r.ts || r.created_at);
    const age = fmtAge(r.ts || r.created_at);
    const cat = (r.category || 'unknown').toLowerCase();
    const sal = Number(r.salience) || 0;
    const salPct = Math.round(sal * 100);
    const content = truncate(r.content || '', 160);
    const sender = r.sender || '—';
    // getMemoryFeed() returns retrieval_count (mirror-derived); the older
    // r.retrievals key was never sent, so this column always rendered 0.
    const retrievals = r.retrieval_count != null ? r.retrieval_count : (r.retrievals != null ? r.retrievals : 0);
    return `
      <tr>
        <td class="cell-id" data-copy="${id}">${id}</td>
        <td class="cell-ts">${ts}</td>
        <td><span class="cell-cat ${cat}">${cat}</span></td>
        <td class="cell-sender">${sender}</td>
        <td class="cell-sal">
          <span class="sal-bar" style="--sal-pct:${salPct}%"></span>
          <span class="sal-num">${fmtScore(sal)}</span>
        </td>
        <td class="cell-sender">${retrievals}</td>
        <td class="cell-sender">${age}</td>
        <td class="cell-content">${escapeHtml(content)}</td>
      </tr>`;
  }).join('');

  el.innerHTML = `
    <table class="memory-feed-table">
      <thead><tr>
        <th>id</th><th>ts</th><th>category</th><th>sender</th><th>salience</th><th>retr</th><th>age</th><th>content</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table>`;
  attachCopyHandlers(el);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------- category distribution bars (Plotly) ---------- */

async function renderCategoryBars(el) {
  showLoading(el);
  const rows = await fetchJson('/api/memory/by-category');
  if (!rows) return showError(el, 'by-category endpoint unreachable');
  if (!Array.isArray(rows) || rows.length === 0) return showEmpty(el, 'no categories yet');
  const sorted = rows.slice().sort((a, b) => (b.count || 0) - (a.count || 0));
  Plotly.newPlot(el, [{
    type: 'bar',
    orientation: 'h',
    x: sorted.map(r => Number(r.count) || 0),
    y: sorted.map(r => r.category),
    text: sorted.map(r => fmtNum(r.count)),
    textposition: 'outside',
    marker: { color: sorted.map(r => LANE_FOR_CATEGORY[(r.category || '').toLowerCase()] || PALETTE.inkDim) },
    hovertemplate: '%{y}<br>%{x} memories<br>median salience: %{customdata}<extra></extra>',
    customdata: sorted.map(r => fmtScore(r.median_salience)),
  }], baseLayout({
    height: Math.max(220, sorted.length * 36),
    xaxis: baseAxis({ title: { text: 'memories', font: { size: 10, color: PALETTE.inkMid } } }),
    yaxis: baseAxis({ automargin: true }),
    margin: { l: 140, r: 60, t: 12, b: 50 },
  }), plotlyConfig);
}

/* ---------- category sortable salience table ---------- */

async function renderCategoryTable(el) {
  showLoading(el);
  const rows = await fetchJson('/api/memory/by-category');
  if (!rows) return showError(el, 'by-category endpoint unreachable');
  if (!Array.isArray(rows) || rows.length === 0) return showEmpty(el, 'no categories yet');

  const total = rows.reduce((a, r) => a + (Number(r.count) || 0), 0);
  let sortKey = 'count';
  let sortDir = -1;

  const render = () => {
    const sorted = rows.slice().sort((a, b) => {
      const av = Number(a[sortKey]) || 0;
      const bv = Number(b[sortKey]) || 0;
      return sortDir * (av - bv);
    });
    const tbody = sorted.map(r => {
      const cat = (r.category || 'unknown').toLowerCase();
      const count = Number(r.count) || 0;
      const pct = total ? (count / total) * 100 : 0;
      const sal = Number(r.median_salience) || 0;
      const salClass = sal >= 0.7 ? 'high' : sal < 0.5 ? 'low' : '';
      const color = LANE_FOR_CATEGORY[cat] || PALETTE.inkDim;
      const retr = r.retrievals_7d != null ? r.retrievals_7d : 0;
      return `
        <tr>
          <td><span class="cell-cat" style="background:${color}22;color:${color}">${cat}</span></td>
          <td>${fmtNum(count)}</td>
          <td style="color:var(--ink-muted,#5a5a5a)">${pct.toFixed(1)}%</td>
          <td><div class="cat-bar-wrap"><div class="cat-bar-fill" style="width:${pct}%;background:${color}"></div></div></td>
          <td><span class="cat-sal-median ${salClass}">${fmtScore(sal)}</span></td>
          <td style="color:var(--ink-muted,#5a5a5a)">${retr}</td>
        </tr>`;
    }).join('');
    el.innerHTML = `
      <table class="cat-table">
        <thead><tr>
          <th data-sort="category">Category</th>
          <th data-sort="count" class="${sortKey === 'count' ? 'sorted' : ''}">Count ${sortKey === 'count' ? (sortDir < 0 ? '▾' : '▴') : '↕'}</th>
          <th>% of corpus</th>
          <th>Distribution</th>
          <th data-sort="median_salience" class="${sortKey === 'median_salience' ? 'sorted' : ''}">Median salience ${sortKey === 'median_salience' ? (sortDir < 0 ? '▾' : '▴') : '↕'}</th>
          <th data-sort="retrievals_7d" class="${sortKey === 'retrievals_7d' ? 'sorted' : ''}">Retrievals (7d) ${sortKey === 'retrievals_7d' ? (sortDir < 0 ? '▾' : '▴') : '↕'}</th>
        </tr></thead>
        <tbody>${tbody}</tbody>
      </table>`;
    el.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset.sort;
        if (key === sortKey) sortDir = -sortDir;
        else { sortKey = key; sortDir = -1; }
        render();
      });
    });
  };
  render();
}

/* ---------- aging callouts (THE crown jewel) ---------- */

const AGING_DEF = [
  {
    key: 'decay_leader',
    tag: 'Decay leader',
    laneClass: 'lane-red',
    chipClass: 'lane-red',
    emptyMsg: 'No decay leader yet — corpus too young',
    primary:   { label: 'Reinforce now', action: 'reinforce' },
    secondary: { label: 'Show me',       action: 'view' },
  },
  {
    key: 'long_stored_stranger',
    tag: 'Long-stored stranger',
    laneClass: 'lane-auber',
    chipClass: 'lane-auber',
    emptyMsg: 'Nothing has aged long enough to qualify',
    primary:   { label: 'Review to decide', action: 'review' },
    secondary: { label: 'Archive',          action: 'archive' },
  },
  {
    key: 'surprise_faded',
    tag: 'Surprise that faded',
    laneClass: 'lane-terra',
    chipClass: 'lane-terra',
    emptyMsg: 'No fading surprises detected',
    primary: { label: 'Show me', action: 'view' },
  },
  {
    key: 'cluster_nobody_visited',
    tag: 'Cluster nobody visited',
    laneClass: 'lane-slate',
    chipClass: 'lane-slate',
    emptyMsg: 'All clusters still warm — keep going',
    primary: { label: 'Show me', action: 'view' },
  },
  {
    key: 'retrieval_gap',
    tag: 'Retrieval gap',
    laneClass: 'lane-gold',
    chipClass: 'lane-gold',
    emptyMsg: 'No retrieval gaps in last sweep',
    primary:   { label: 'Reinforce now', action: 'reinforce' },
    secondary: { label: 'Show me',       action: 'view' },
  },
  {
    key: 'memory_horizon',
    tag: 'Memory horizon',
    laneClass: 'lane-teal',
    chipClass: 'lane-teal',
    emptyMsg: 'Need more retrievals to compute horizon',
    primary: { label: 'Show me', action: 'view' },
  },
];

function buildAgingCard(def, payload) {
  const data = payload && payload[def.key];

  if (!data || (Object.keys(data).length === 0)) {
    return `
      <div class="aging-card placeholder ${def.laneClass}">
        <span class="lane-chip ${def.chipClass}">${def.tag}</span>
        <div class="placeholder-msg"><em>${def.emptyMsg}</em></div>
      </div>`;
  }

  // Backend can send either a structured object or a pre-rendered headline/body.
  const headline = data.headline_html || data.headline || '';
  const body = data.body_html || data.body || '';
  const memId = data.memory_id;
  const meta = data.meta || (memId != null ? `id ${memId}` : '');

  const actions = [];
  if (def.primary) {
    actions.push(`<button class="btn-primary" data-action="${def.primary.action}" ${memId != null ? `data-mem-id="${memId}"` : ''}>${def.primary.label}</button>`);
  }
  if (def.secondary) {
    actions.push(`<button class="btn-secondary" data-action="${def.secondary.action}" ${memId != null ? `data-mem-id="${memId}"` : ''}>${def.secondary.label}</button>`);
  }

  return `
    <div class="aging-card ${def.laneClass}">
      <span class="lane-chip ${def.chipClass}">${def.tag}</span>
      <div class="headline">${headline}</div>
      <div class="body">${body}</div>
      ${meta ? `<div class="meta-line" ${memId != null ? `data-copy="${memId}"` : ''}>${meta}</div>` : ''}
      ${actions.length ? `<div class="actions">${actions.join('')}</div>` : ''}
    </div>`;
}

async function renderAgingCallouts(el) {
  showLoading(el);
  const data = await fetchJson('/api/memory/aging');
  if (data === null) return showError(el, 'aging endpoint unreachable');
  // data may be {} when corpus is empty — still render placeholders
  const payload = data || {};
  el.classList.add('aging-grid');
  el.innerHTML = AGING_DEF.map(def => buildAgingCard(def, payload)).join('');
  attachCopyHandlers(el);
  // Wire action buttons — minimum viable: alert the action + id.
  // Backend can later turn these into real endpoints.
  el.querySelectorAll('button[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      const memId = btn.dataset.memId;
      console.log('[render-memory] action', action, 'on memory', memId);
      // Placeholder feedback
      btn.disabled = true;
      const orig = btn.textContent;
      btn.textContent = '✓ noted';
      setTimeout(() => { btn.disabled = false; btn.textContent = orig; }, 1600);
    });
  });
}

/* ---------- decay 4-panel grid (histograms + scatter) ---------- */

async function renderDecayPanels(el) {
  showLoading(el);
  const data = await fetchJson('/api/memory/decay-panels');
  if (!data) return showError(el, 'decay endpoint unreachable');

  el.classList.add('decay-grid');
  el.innerHTML = `
    <div class="chart-card">
      <div class="chart-card-head"><h2 class="chart-card-title">Panel A · <em>synthetic_decay</em> distribution</h2><span class="chart-card-meta">12 buckets</span></div>
      <div class="chart-mount" id="decay-panel-a"></div>
    </div>
    <div class="chart-card">
      <div class="chart-card-head"><h2 class="chart-card-title">Panel B · <em>salience</em> distribution</h2><span class="chart-card-meta">centred ~ 0.65</span></div>
      <div class="chart-mount" id="decay-panel-b"></div>
    </div>
    <div class="chart-card">
      <div class="chart-card-head"><h2 class="chart-card-title">Panel C · <em>surprise</em> at birth</h2><span class="chart-card-meta">long tail</span></div>
      <div class="chart-mount" id="decay-panel-c"></div>
    </div>
    <div class="chart-card">
      <div class="chart-card-head"><h2 class="chart-card-title">Panel D · decay × <em>age</em> scatter</h2><span class="chart-card-meta">outliers in red</span></div>
      <div class="chart-mount" id="decay-panel-d"></div>
    </div>`;

  const decayHist = data.decay_histogram || data.decay || [];
  const salienceHist = data.salience_histogram || data.salience || [];
  const surpriseHist = data.surprise_histogram || data.surprise || [];
  const scatter = data.decay_age_scatter || data.scatter || [];

  // Panel A — synthetic_decay (navy bars, danger red for highest bucket)
  if (decayHist.length === 0) {
    showEmpty(document.getElementById('decay-panel-a'), 'no decay scores yet');
  } else {
    const colors = decayHist.map((b, i) => {
      if (i >= decayHist.length - 1) return PALETTE.warnRed;
      return PALETTE.navy;
    });
    Plotly.newPlot('decay-panel-a', [{
      type: 'bar',
      x: decayHist.map(b => b.bucket != null ? Number(b.bucket).toFixed(2) : String(b.label || '')),
      y: decayHist.map(b => Number(b.count) || 0),
      text: decayHist.map(b => fmtNum(b.count)),
      textposition: 'outside',
      marker: { color: colors },
      hovertemplate: 'bucket %{x}<br>%{y} memories<extra></extra>',
    }], baseLayout({
      height: 240,
      xaxis: baseAxis({ title: { text: 'synthetic_decay', font: { size: 9, color: PALETTE.inkMid } } }),
      yaxis: baseAxis({ title: { text: 'memories', font: { size: 9, color: PALETTE.inkMid } } }),
    }), plotlyConfig);
  }

  // Panel B — salience (gold)
  if (salienceHist.length === 0) {
    showEmpty(document.getElementById('decay-panel-b'), 'no salience histogram');
  } else {
    Plotly.newPlot('decay-panel-b', [{
      type: 'bar',
      x: salienceHist.map(b => b.bucket != null ? Number(b.bucket).toFixed(2) : String(b.label || '')),
      y: salienceHist.map(b => Number(b.count) || 0),
      text: salienceHist.map(b => fmtNum(b.count)),
      textposition: 'outside',
      marker: { color: PALETTE.gold },
      hovertemplate: 'salience ~%{x}<br>%{y} memories<extra></extra>',
    }], baseLayout({
      height: 240,
      xaxis: baseAxis({ title: { text: 'salience', font: { size: 9, color: PALETTE.inkMid } } }),
      yaxis: baseAxis({ title: { text: 'memories', font: { size: 9, color: PALETTE.inkMid } } }),
    }), plotlyConfig);
  }

  // Panel C — surprise at birth (terracotta)
  if (surpriseHist.length === 0) {
    showEmpty(document.getElementById('decay-panel-c'), 'no surprise histogram');
  } else {
    Plotly.newPlot('decay-panel-c', [{
      type: 'bar',
      x: surpriseHist.map(b => b.bucket != null ? Number(b.bucket).toFixed(2) : String(b.label || '')),
      y: surpriseHist.map(b => Number(b.count) || 0),
      text: surpriseHist.map(b => fmtNum(b.count)),
      textposition: 'outside',
      marker: { color: PALETTE.terra },
      hovertemplate: 'surprise ~%{x}<br>%{y} memories<extra></extra>',
    }], baseLayout({
      height: 240,
      xaxis: baseAxis({ title: { text: 'surprise', font: { size: 9, color: PALETTE.inkMid } } }),
      yaxis: baseAxis({ title: { text: 'memories', font: { size: 9, color: PALETTE.inkMid } } }),
    }), plotlyConfig);
  }

  // Panel D — decay × age scatter (slate)
  if (scatter.length === 0) {
    showEmpty(document.getElementById('decay-panel-d'), 'no scatter points');
  } else {
    const xs = scatter.map(p => Number(p.age_days) || 0);
    const ys = scatter.map(p => Number(p.decay) || 0);
    const ids = scatter.map(p => p.id != null ? p.id : '—');
    const colors = scatter.map(p => {
      if (p.is_outlier || (Number(p.decay) >= 0.85 && Number(p.age_days) >= 30)) return PALETTE.warnRed;
      if (p.is_relevant) return PALETTE.goodGrn;
      return PALETTE.slate;
    });
    Plotly.newPlot('decay-panel-d', [{
      type: 'scatter',
      mode: 'markers',
      x: xs, y: ys,
      marker: { color: colors, size: 7, opacity: 0.78, line: { width: 1, color: PALETTE.ink } },
      customdata: ids,
      hovertemplate: 'id %{customdata}<br>age %{x}d<br>decay %{y:.2f}<extra></extra>',
    }], baseLayout({
      height: 280,
      xaxis: baseAxis({ title: { text: 'days since last retrieval', font: { size: 9, color: PALETTE.inkMid } } }),
      yaxis: baseAxis({ title: { text: 'synthetic_decay', font: { size: 9, color: PALETTE.inkMid } }, range: [0, 1] }),
    }), plotlyConfig);
  }
}

/* ---------- theme-tier chip bar ---------- */

/**
 * renderThemeTierChips(el, onChange)
 *
 * Mirrors renderCategoryChips but for embedding tiers on the Themes UMAP page.
 * One chip per tier present in tm_themes_cache (pro, edge, etc.), label format:
 * `<tier> · <points>pts · <clusters>c`. Single-select, no "all" chip since
 * UMAP coordinates aren't comparable across embedding models — mixing two
 * tiers in one scatter would be meaningless.
 */
async function renderThemeTierChips(el, onChange, initialTier) {
  el.innerHTML = `
    <div class="category-chip-bar" id="tier-chip-bar-inner">
      <span class="cat-chip-skeleton"></span>
      <span class="cat-chip-skeleton" style="width:84px"></span>
    </div>`;

  const tiers = await fetchJson('/api/memory/theme-tiers');
  const bar = el.querySelector('#tier-chip-bar-inner') || el;
  bar.innerHTML = '<span class="category-chip-bar-label">embedding tier</span>';

  if (!Array.isArray(tiers) || tiers.length === 0) {
    bar.innerHTML += '<span class="empty-msg" style="font-family:\'DM Mono\',monospace;font-size:11px;opacity:0.5">no tiers cached yet</span>';
    return;
  }

  // Initial selection: from URL ?tier= param, or first tier returned by API
  // (which is sorted by point count desc, so usually pro).
  const urlParams = new URLSearchParams(window.location.search);
  const active = initialTier || urlParams.get('tier') || tiers[0].tier;

  tiers.forEach(({ tier, points, clusters }) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'cat-filter-chip' + (tier === active ? ' active' : '');
    chip.dataset.tier = tier;
    chip.innerHTML = escapeHtml(tier)
      + ' <span class="chip-count">· ' + (points || 0) + 'pts · ' + (clusters || 0) + 'c</span>';
    bar.appendChild(chip);
  });

  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.cat-filter-chip');
    if (!chip) return;
    const tier = chip.dataset.tier;
    bar.querySelectorAll('.cat-filter-chip').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');

    const params = new URLSearchParams(window.location.search);
    params.set('tier', tier);
    history.replaceState(null, '', window.location.pathname + '?' + params.toString());
    onChange(tier);
  });
}

/* ---------- themes UMAP scatter ---------- */

async function renderThemesUMAP(el, calloutsEl, tier) {
  showLoading(el);
  const tierParam = tier ? '?tier=' + encodeURIComponent(tier) : '';
  const data = await fetchJson('/api/memory/themes' + tierParam);
  if (!data) return showError(el, 'themes endpoint unreachable');
  const points = data.points || data;
  if (!Array.isArray(points) || points.length === 0) {
    showEmpty(el, 'no themes computed yet');
    if (calloutsEl) calloutsEl.innerHTML = '';
    return;
  }

  // Color points by cluster_name (semantic category) so dozens of HDBSCAN
  // cluster_ids collapse into a small set of human-readable categories.
  // Each named category gets a stable lane color; '(noise)' and '(unlabeled)'
  // use inkDim so they sit visually behind the meaningful clusters.
  const CATEGORY_COLORS = {
    technical:    PALETTE.slate,
    preference:   PALETTE.terra,
    decision:     PALETTE.teal,
    correction:   PALETTE.auber,
    personal:     PALETTE.gold,
    reference:    PALETTE.tealDim,
    temporal:     PALETTE.goodGrn,
    relationship: PALETTE.navy,
  };
  const NOISE_COLOR = PALETTE.inkDim;

  const traces = [];
  const byCategory = new Map();
  points.forEach(p => {
    const raw = (p.cluster_name || '').trim();
    const key = raw && raw !== '(noise)' && raw !== '(unlabeled)' ? raw : raw || 'noise';
    if (!byCategory.has(key)) byCategory.set(key, []);
    byCategory.get(key).push(p);
  });

  // Sort: named categories first (by size desc), then unlabeled, then noise.
  const sortedKeys = Array.from(byCategory.keys()).sort((a, b) => {
    const aNoise = a === 'noise' || a === '(noise)';
    const bNoise = b === 'noise' || b === '(noise)';
    if (aNoise && !bNoise) return 1;
    if (!aNoise && bNoise) return -1;
    const aUnl = a === '(unlabeled)';
    const bUnl = b === '(unlabeled)';
    if (aUnl && !bUnl) return 1;
    if (!aUnl && bUnl) return -1;
    return byCategory.get(b).length - byCategory.get(a).length;
  });

  sortedKeys.forEach(key => {
    const cluster = byCategory.get(key);
    const isNoise = key === 'noise' || key === '(noise)';
    const isUnlabeled = key === '(unlabeled)';
    const color = isNoise || isUnlabeled
      ? NOISE_COLOR
      : (CATEGORY_COLORS[key] || PALETTE.navy);
    traces.push({
      type: 'scatter',
      mode: 'markers',
      name: isNoise ? 'noise' : `${key} · ${cluster.length}`,
      x: cluster.map(p => Number(p.x) || 0),
      y: cluster.map(p => Number(p.y) || 0),
      marker: {
        size: cluster.map(p => Math.max(5, Math.min(14, 5 + Math.sqrt((Number(p.retrievals) || 0) * 2)))),
        color,
        opacity: isNoise ? 0.35 : (isUnlabeled ? 0.55 : 0.82),
        line: { color: PALETTE.ink, width: 0.5 },
      },
      customdata: cluster.map(p => [p.id || '—', p.label || '', p.retrievals || 0, p.cluster_name || '—']),
      hovertemplate: 'id %{customdata[0]}<br>%{customdata[3]}<br>%{customdata[1]}<br>%{customdata[2]} retrievals<extra></extra>',
    });
  });

  Plotly.newPlot(el, traces, baseLayout({
    height: 520,
    xaxis: baseAxis({ title: { text: 'UMAP-1', font: { size: 9 } }, zeroline: false, showticklabels: false }),
    yaxis: baseAxis({ title: { text: 'UMAP-2', font: { size: 9 } }, zeroline: false, showticklabels: false }),
    showlegend: true,
    legend: { font: { family: '"DM Mono", monospace', size: 10 }, orientation: 'h', y: -0.12 },
    margin: { l: 40, r: 30, t: 20, b: 60 },
  }), plotlyConfig);

  // Render "what the map says" callouts (forgotten cluster, orphans).
  // The endpoint currently doesn't compute these (upstream telemetry doesn't
  // emit the underlying signals yet) — render an honest empty state so the
  // section doesn't sit on a loading spinner forever.
  if (calloutsEl) {
    const c = data.callouts ?? null;
    const cards = [];
    if (c?.forgotten_cluster) {
      cards.push(`
        <div class="aging-card lane-slate">
          <span class="lane-chip lane-slate">Forgotten cluster</span>
          <div class="headline">${c.forgotten_cluster.headline || ''}</div>
          <div class="body">${c.forgotten_cluster.body || ''}</div>
        </div>`);
    }
    if (c?.orphan_memory) {
      cards.push(`
        <div class="aging-card lane-auber">
          <span class="lane-chip lane-auber">Orphan memory</span>
          <div class="headline">${c.orphan_memory.headline || ''}</div>
          <div class="body">${c.orphan_memory.body || ''}</div>
        </div>`);
    }
    calloutsEl.classList.add('themes-callout-grid');
    calloutsEl.innerHTML = cards.length
      ? cards.join('')
      : '<div class="empty-state"><span class="empty-icon">∅</span><span class="empty-msg">no UMAP callouts yet</span></div>';
  }
}

/* ---------- ops health (06 mirror) ---------- */

async function renderOpsHealth(el) {
  showLoading(el);
  const data = await fetchJson('/api/memory/ops');
  if (!data) return showError(el, 'ops endpoint unreachable');

  const kpis = data.kpis || {};
  const timings = data.timings || {};
  const failures = data.failures_7d || {};
  const stream = data.log_stream || [];

  const kpiCells = [
    { label: 'Reranker cold-load avg', value: timings.reranker_cold_avg_ms != null ? (timings.reranker_cold_avg_ms / 1000).toFixed(1) + 's' : '—',
      delta: timings.reranker_cold_p95_ms != null ? 'p95: ' + (timings.reranker_cold_p95_ms / 1000).toFixed(1) + 's' : '' },
    { label: 'LLM call p95', value: timings.llm_call_p95_ms != null ? (timings.llm_call_p95_ms / 1000).toFixed(1) + 's' : '—',
      delta: timings.llm_call_avg_ms != null ? 'avg ' + (timings.llm_call_avg_ms / 1000).toFixed(1) + 's' : '' },
    { label: '_parallel_search fails (7d)', value: failures.parallel_search != null ? fmtNum(failures.parallel_search) : '0', delta: '' },
    { label: 'Drainer ticks (7d)', value: fmtNum(kpis.drainer_ticks_7d || 0), delta: kpis.drainer_items != null ? (kpis.drainer_items + ' items') : '' },
    { label: 'Forget events (7d)', value: fmtNum(kpis.forget_events_7d || 0), delta: 'audit trail' },
    { label: 'Configure re-embeds (7d)', value: fmtNum(kpis.configure_reembeds_7d || 0), delta: 'model switch events' },
  ];

  el.innerHTML = `
    <div class="kpi-strip">${kpiCells.map(c => `
      <div class="kpi-cell">
        <span class="label">${c.label}</span>
        <span class="value">${c.value}</span>
        <span class="delta flat">${c.delta || ''}</span>
      </div>`).join('')}</div>
    <h4 style="margin-top:24px">Live telemetry — <code>~/.truememory/logs/mcp-debug.log</code></h4>
    <div class="ops-log-stream" id="ops-log-stream"></div>
    <div class="decay-grid" style="margin-top:24px">
      <div class="chart-card">
        <div class="chart-card-head"><h2 class="chart-card-title">Reranker <em>cold-load</em> latency</h2><span class="chart-card-meta">last sessions</span></div>
        <div class="chart-mount" id="ops-reranker-chart"></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-head"><h2 class="chart-card-title">LLM <em>call</em> p50/p95</h2><span class="chart-card-meta">ms</span></div>
        <div class="chart-mount" id="ops-llm-chart"></div>
      </div>
    </div>`;

  // Log stream
  const logEl = document.getElementById('ops-log-stream');
  if (!stream.length) {
    showEmpty(logEl, 'no log lines yet');
  } else {
    logEl.innerHTML = stream.map(l => {
      const cls = l.lane || (l.event && l.event.includes('FAIL') ? 'warn' : 'ops');
      const kvParts = (l.kv ? Object.entries(l.kv) : []).map(([k, v]) => `<span class="kv">${escapeHtml(k)}=</span><span class="val">${escapeHtml(String(v))}</span>`).join(' ');
      return `<div class="line ${escapeHtml(cls)}"><span class="ts">${escapeHtml(l.ts || '')}</span><span class="evt">${escapeHtml(l.event || '')}</span> ${kvParts}</div>`;
    }).join('');
  }

  // Reranker chart
  const rrChart = document.getElementById('ops-reranker-chart');
  if (timings.reranker_samples && timings.reranker_samples.length) {
    Plotly.newPlot(rrChart, [{
      type: 'scatter',
      mode: 'markers',
      x: timings.reranker_samples.map((_, i) => i),
      y: timings.reranker_samples.map(v => Number(v) || 0),
      marker: { color: PALETTE.slate, size: 7, opacity: 0.78 },
      hovertemplate: 'session %{x}<br>%{y} ms<extra></extra>',
    }], baseLayout({
      height: 240,
      xaxis: baseAxis({ title: { text: 'session (oldest → newest)', font: { size: 9, color: PALETTE.inkMid } } }),
      yaxis: baseAxis({ title: { text: 'load (ms)', font: { size: 9, color: PALETTE.inkMid } } }),
    }), plotlyConfig);
  } else {
    showEmpty(rrChart, 'no reranker timings yet');
  }

  // LLM chart — histogram of latency
  const llmChart = document.getElementById('ops-llm-chart');
  if (timings.llm_histogram && timings.llm_histogram.length) {
    Plotly.newPlot(llmChart, [{
      type: 'bar',
      x: timings.llm_histogram.map(b => b.bucket_ms != null ? b.bucket_ms : b.label),
      y: timings.llm_histogram.map(b => Number(b.count) || 0),
      marker: { color: PALETTE.auber },
      hovertemplate: '%{x}ms bucket<br>%{y} calls<extra></extra>',
    }], baseLayout({
      height: 240,
      xaxis: baseAxis({ title: { text: 'latency (ms)', font: { size: 9, color: PALETTE.inkMid } } }),
      yaxis: baseAxis({ title: { text: 'calls', font: { size: 9, color: PALETTE.inkMid } } }),
    }), plotlyConfig);
  } else {
    showEmpty(llmChart, 'no llm timings yet');
  }
}

/* ---------- encoding gate (07 mirror) ---------- */

async function renderEncodingGate(el) {
  showLoading(el);
  const data = await fetchJson('/api/memory/gate');
  if (!data) return showError(el, 'gate endpoint unreachable');

  const passRate = Number(data.pass_rate) || 0;
  const passCount = data.pass_count || 0;
  const rejectCount = data.reject_count || 0;
  const total = passCount + rejectCount;
  const reasons = data.reject_reasons || [];
  const sessionPassRates = data.session_pass_rates || [];

  el.innerHTML = `
    <div class="kpi-strip">
      <div class="kpi-cell"><span class="label">Pass rate (7d)</span><span class="value">${(passRate * 100).toFixed(1)}%</span><span class="delta flat">${passCount}/${total}</span></div>
      <div class="kpi-cell"><span class="label">Passes (7d)</span><span class="value">${fmtNum(passCount)}</span><span class="delta flat">accepted</span></div>
      <div class="kpi-cell"><span class="label">Rejects (7d)</span><span class="value">${fmtNum(rejectCount)}</span><span class="delta flat">filtered</span></div>
      <div class="kpi-cell"><span class="label">Total evaluated</span><span class="value">${fmtNum(total)}</span><span class="delta flat">candidates</span></div>
    </div>
    <h4 style="margin-top:24px">Pass / reject ratio — last 7 days</h4>
    <div class="gate-bar">
      <div class="pass" style="width:${(passRate * 100).toFixed(1)}%">${passCount} passed · ${(passRate * 100).toFixed(1)}%</div>
      <div class="reject" style="width:${((1 - passRate) * 100).toFixed(1)}%">${rejectCount} rejected · ${((1 - passRate) * 100).toFixed(1)}%</div>
    </div>
    <h4 style="margin-top:18px">Per-session pass-rate sparkline</h4>
    <div class="chart-mount" id="gate-sparkline"></div>
    <h4 style="margin-top:18px">Top rejection reasons — last 7 days</h4>
    <div id="gate-reasons-mount"></div>`;

  // Sparkline
  const spark = document.getElementById('gate-sparkline');
  if (!sessionPassRates.length) {
    showEmpty(spark, 'no per-session data yet');
  } else {
    Plotly.newPlot(spark, [{
      type: 'bar',
      x: sessionPassRates.map((_, i) => i + 1),
      y: sessionPassRates.map(r => Number(r) || 0),
      marker: { color: sessionPassRates.map(r => Number(r) < 0.25 ? PALETTE.warnRed : Number(r) < 0.35 ? PALETTE.gold : PALETTE.teal) },
      hovertemplate: 'session %{x}<br>pass %{y:.1%}<extra></extra>',
    }], baseLayout({
      height: 180,
      xaxis: baseAxis({ title: { text: 'session', font: { size: 9, color: PALETTE.inkMid } } }),
      yaxis: baseAxis({ tickformat: ',.0%', range: [0, 1] }),
    }), plotlyConfig);
  }

  // Reasons table
  const reasonsEl = document.getElementById('gate-reasons-mount');
  if (!reasons.length) {
    showEmpty(reasonsEl, 'no rejections to break down');
  } else {
    reasonsEl.innerHTML = `
      <table class="gate-reasons">
        <thead><tr><th>Reason code</th><th>Count</th><th>Pct</th><th>Interpretation</th></tr></thead>
        <tbody>${reasons.map(r => `
          <tr>
            <td><code>${escapeHtml(r.reason_code || '—')}</code></td>
            <td>${fmtNum(r.count)}</td>
            <td>${r.pct != null ? (Number(r.pct) * 100).toFixed(0) + '%' : '—'}</td>
            <td>${escapeHtml(r.interpretation || '')}</td>
          </tr>`).join('')}</tbody>
      </table>`;
  }
}

/* ---------- open loops (08 mirror, optional) ---------- */

async function renderOpenLoops(el) {
  showLoading(el);
  const data = await fetchJson('/api/memory/open-loops');
  if (!data) return showError(el, 'open-loops endpoint unreachable');
  const loops = data.loops || data;
  if (!Array.isArray(loops) || loops.length === 0) return showEmpty(el, 'no open loops reported');
  el.classList.add('aging-grid');
  el.innerHTML = loops.map(l => `
    <div class="aging-card lane-slate">
      <span class="lane-chip lane-slate">${escapeHtml(l.tag || 'Dead signal')}</span>
      <div class="headline">${escapeHtml(l.title || '')}</div>
      <div class="body">${escapeHtml(l.body || '')}</div>
      ${l.activation ? `<div class="meta-line"><strong>to activate:</strong> ${escapeHtml(l.activation)}</div>` : ''}
    </div>`).join('');
}

/* ---------- refresh button hook-up ---------- */

function attachRefresh(buttonEl, refreshFn) {
  if (!buttonEl) return;
  buttonEl.addEventListener('click', async () => {
    buttonEl.classList.add('spinning');
    try {
      await refreshFn();
    } finally {
      buttonEl.classList.remove('spinning');
    }
  });
}

/* expose on window for inline page scripts */
window.GTBM = {
  API_BASE, PALETTE, LANE_FOR_CATEGORY, AGING_DEF,
  fetchJson, fmtNum, fmtPct, fmtScore, fmtTs, fmtAge, truncate,
  renderMemoryKpiStrip, renderMemoryActivityHeatmap, renderMemoryFeed,
  renderCategoryChips,
  renderThemeTierChips,
  renderCategoryBars, renderCategoryTable, renderAgingCallouts,
  renderDecayPanels, renderThemesUMAP, renderOpsHealth, renderEncodingGate,
  renderOpenLoops, attachRefresh, showLoading, showEmpty, showError,
  copyToClipboard, attachCopyHandlers, escapeHtml,
};
