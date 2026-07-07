/**
 * Metric glossary — the ONE place explainer copy for tooltips/hover cards lives.
 *
 * Authored content (Hunter / main-thread Claude, 2026-07-07). Style: what it is →
 * why it matters → what to do about it. Never invent explainer prose in a
 * sub-agent — flag the key and let it be authored in the main thread.
 */

export interface MetricDoc {
  title: string
  body: string
  formula?: string
}

export const GLOSSARY = {
  // ── Overview / KPI ──────────────────────────────────────────────
  'kpi.total': {
    title: 'Total memories',
    body: 'Every memory in the store — one global brain across all projects and sessions, not per-project. Grows with each session-close extraction, manual store, and backfill run.',
  },
  'kpi.injections24h': {
    title: 'Injections (24h)',
    body: 'How many times TrueMemory placed memories into a Claude context in the last day — session-open blanket recalls plus targeted per-prompt recalls. A full day at zero means the recall side is broken, not quiet.',
  },
  'kpi.stores24h': {
    title: 'New memories (24h)',
    body: 'Memories written in the last day, from session-close extraction, manual stores, or backfill. Spikes during backfill are expected; a flat zero on a day you used Claude means capture is stalled.',
  },
  'kpi.directives': {
    title: 'Active directives',
    body: 'Standing instructions ("always do X") that auto-load into EVERY new session — no relevance matching required. Powerful and permanent, so keep the list short; stale directives are the first thing to prune.',
  },
  'kpi.gatePassRate': {
    title: 'Encoding gate pass rate',
    body: 'Share of candidate facts the encoding gate accepted into the store. The gate scores salience and novelty — a very high rate means junk is getting through; a very low one means real facts are being dropped.',
  },

  // ── Feed / memory rows ──────────────────────────────────────────
  'feed.salience': {
    title: 'Salience',
    body: 'How important the pipeline believes this memory is (0–1), set at encoding and nudged up each time it gets retrieved. Memories below the recall guard threshold (~0.02–0.05 depending on query mode) quietly stop injecting.',
  },
  'feed.category': {
    title: 'Category',
    body: 'The extractor’s label: technical, decision, preference, personal, activity, correction, temporal, relationship, or reference. Blank means it predates categorization or the extractor declined to guess.',
  },
  'feed.retrievalCount': {
    title: 'Times retrieved',
    body: 'How often this memory has actually surfaced into a chat. High = load-bearing memory. Zero after months = dead weight and a curation candidate — but check the embed-coverage gauge first; an un-embedded memory can’t win vector search no matter how good it is.',
  },
  'feed.surprise': {
    title: 'Surprise score',
    body: 'Prediction-error at encoding time: how much this memory deviated from what the store already knew. High surprise = genuinely new information; near-zero = probably a re-statement of something already stored.',
  },
  'feed.directiveFlag': {
    title: 'Directive',
    body: 'This row is a standing instruction, not a passive fact — it injects into every session unconditionally. Directives deserve different scrutiny: one bad directive pollutes every future chat.',
  },

  // ── Injections feed ─────────────────────────────────────────────
  'injections.hook': {
    title: 'Hook',
    body: 'Which trigger fired: SessionStart (blanket recall when a chat opens), UserPromptSubmit (targeted recall, roughly every 5th prompt or on recall-shaped questions), Stop (session-close capture), Compact (pre-compaction snapshot).',
  },
  'injections.memoryCount': {
    title: 'Memories carried',
    body: 'How many memories this injection delivered. Zero means the hook fired but nothing cleared the relevance bar — a silent miss. If the topic SHOULD have matched something, reproduce it in the Simulator to see which stage dropped it.',
  },
  'injections.charCount': {
    title: 'Injected size',
    body: 'Characters of the block placed into context. SessionStart works under a ~8KB budget with per-memory truncation at 500 chars — when the budget runs out, lower-ranked memories are dropped entirely, not shortened.',
  },
  'injections.outcome': {
    title: 'Outcome',
    body: 'Hit = memories injected. Empty = hook fired, nothing qualified (silent miss). Error = the hook failed before recall completed. Empties on topics you care about are the most diagnostic rows on this page.',
  },
  'injections.sessionId': {
    title: 'Session',
    body: 'The Claude Code session that received this injection. "unknown" historically meant the hook’s stdin was being destroyed — if you ever see it again, hook plumbing has regressed.',
  },

  // ── Status bar ──────────────────────────────────────────────────
  'status.mirrorLag': {
    title: 'Mirror freshness',
    body: 'Seconds since the Postgres mirror last synced from the live SQLite store. Most pages read the mirror, so data here can trail reality by up to one poll cycle (~5 min). The injections ticker bypasses this via the sidecar.',
  },
  'status.sidecar': {
    title: 'Sidecar',
    body: 'The local Python service that imports the real TrueMemory engine — it powers the Simulator, live ticker, and Curation actions. Down = those degrade; every read-only page keeps working off the mirror.',
  },
  'status.matviews': {
    title: 'Matview age',
    body: 'Age of the pre-computed KPI summaries (refreshed ~every 30s). If this climbs into minutes, the refresher loop has stalled — numbers go stale before pages break.',
  },

  // ── Health & coverage ───────────────────────────────────────────
  'health.embedCoverage': {
    title: 'Embed coverage',
    body: 'Memories with a vector in the ACTIVE embedding tier vs total. Anything un-embedded is invisible to semantic search (keyword FTS still finds it). Below ~100% after a big backfill, run a re-embed and watch the progress bar here.',
  },
  'health.rebuildProgress': {
    title: 'Re-embed progress',
    body: 'Live progress of a running vector rebuild (tier switch or backlog catch-up): percent done, throughput, ETA, and RAM pressure straight from the engine’s own status table.',
  },
  'health.modelServer': {
    title: 'Model server',
    body: 'The shared embedding/reranker subprocess. Degraded ("sticky CPU") means it fell back off the GPU and recall latency roughly triples — a restart usually recovers it.',
  },

  // ── Simulator ───────────────────────────────────────────────────
  'sim.hookGate': {
    title: 'Hook gate verdict',
    body: 'Before any search runs, the real hook applies gates: prompt length 10–500 chars, not code-heavy, recall-intent patterns, plus cadence (every ~5th prompt) and debounce. If the gate says no, NOTHING injects regardless of how well your memories match — the most common answer to "why didn’t it inject."',
  },
  'sim.stage.fts': {
    title: 'Stage: keyword (FTS)',
    body: 'Full-text keyword search over memory content — exact-word matching, immune to embedding problems. Strong here + weak in vector = phrasing matched but meaning didn’t embed well (or the memory has no vector at all).',
  },
  'sim.stage.vector': {
    title: 'Stage: semantic (vector)',
    body: 'Cosine similarity between your prompt’s embedding and each memory’s. Catches meaning without shared words. A memory missing from this stage entirely is usually un-embedded — check coverage.',
  },
  'sim.stage.rrf': {
    title: 'Stage: rank fusion (RRF)',
    body: 'Merges the keyword and vector lists by reciprocal rank — a memory ranked well in BOTH beats a memory ranked #1 in only one. This is where the candidate order first takes shape.',
    formula: 'rrf = Σ 1 / (60 + rank)',
  },
  'sim.stage.salienceGuard': {
    title: 'Stage: salience guard',
    body: 'Drops candidates whose salience sits below the mode threshold (0.02 diffuse / 0.05 spotlight). The margin column shows how close each memory was — a fail by 0.003 is a tuning problem, a fail by 0.04 is a genuinely faded memory.',
  },
  'sim.stage.surprise': {
    title: 'Stage: surprise boost',
    body: 'Re-weights results toward high-novelty memories (α=0.2 by default). The delta column shows exactly how many rank positions the boost moved each memory — usually small, occasionally decisive.',
  },
  'sim.stage.reranker': {
    title: 'Stage: cross-encoder rerank',
    body: 'A rerank model reads prompt + memory together and re-scores (60% rerank / 40% fusion blend). NOTE: the live hooks SKIP this stage for latency — toggle it off to see what a real injection would do.',
  },
  'sim.divergence': {
    title: 'Divergence badge',
    body: 'The stage-by-stage breakdown is recomposed from the engine’s individual stages; the authoritative result is one real search() call. If they disagree, trust the authoritative list and treat the explain as approximate for this query — the badge tells you when that happened.',
  },
  'sim.scoreSpace': {
    title: 'Score space',
    body: 'Scores from different stages live in different spaces (BM25 ranks, cosine similarity, RRF sums, rerank logits) and are NOT comparable across columns — only within one. The tag exists so you never read 0.8-cosine vs 0.02-RRF as "40x better."',
  },
  'sim.injectionPreview': {
    title: 'Injection preview',
    body: 'The final assembled block exactly as it would enter Claude’s context — survivors of the char budget, truncated at 500 chars each, directives on top. What the model would actually see, not just a ranked list.',
  },

  // ── Inspector ───────────────────────────────────────────────────
  'inspector.neighbors': {
    title: 'Nearest neighbors',
    body: 'The 10 memories closest in embedding space, with cosine distances. Near-zero distance to another memory = near-duplicate (merge/forget candidate). Neighbors also predict co-retrieval: these tend to inject together.',
  },
  'inspector.provenance': {
    title: 'Provenance',
    body: 'Where this memory came from: which session, which extraction run, stated-by-you vs inferred-by-the-extractor. Inferred memories deserve more skepticism — they’re the ones worth spot-checking against the source transcript.',
  },
  'inspector.timeline': {
    title: 'Fact timeline',
    body: 'The versioned history of this fact: when it became valid, whether a newer memory superseded it, and what replaced it. A superseded memory stops injecting for current questions but remains for temporal ones ("what did I use to prefer?").',
  },
} as const satisfies Record<string, MetricDoc>

export type GlossaryKey = keyof typeof GLOSSARY
