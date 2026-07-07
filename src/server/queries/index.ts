/**
 * Public surface of the /api/memory/* query layer.
 *
 * This barrel re-exports every function and type that memory-queries.ts
 * used to export directly. Consumers (memory-routes.ts, etc.) see an
 * identical API — only the file layout below has changed.
 *
 * Internal helpers (PgRunner, num/numOrNull/intOrNull/tsToIso, CalloutPayload,
 * NeighborCache, memoriesDbPath/openSourceDbRO/buildNeighborCache/
 * getNeighborCache/topKNeighbors) live in ./types.ts and ./sqlite-ro.ts and
 * are deliberately NOT re-exported here — they were internal in the pre-split
 * module and stay internal now.
 */

// ---------- exported types ----------
export type {
  MemoryKpi,
  MemoryFeedRow,
  MemoryByCategoryRow,
  MemoryAging,
  MemoryThemePoint,
  MemoryThemesResp,
  MemoryOperations,
  MemoryEncodingGate,
  MemoryFeedCategory,
  MemoryThemeTier,
  OpsRich,
  GateRich,
  OpenLoopCard,
  OpenLoopsResp,
  DecayHistBucket,
  DecayScatterPoint,
  MemoryActivityRow,
  MemoryDecayPanels,
  MemoryInjectionRow,
  MemoryInspectResult,
  EntityProfileRow,
  FactTimelineRow,
  FactTimelineChain,
  MemoryTimeline,
  EpisodeRow,
  LandmarkEventRow,
  MemorySessions,
  HealthTier,
  RebuildStatusRow,
  ModelServerFsStatus,
  MemoryHealthDetail,
} from './types.js';

// ---------- exported functions ----------
export { getMemoryKpi } from './kpi.js';
export { getMemoryFeed, getMemoryFeedCategories, getMemoryByCategory } from './feed.js';
export { getMemoryAging } from './aging.js';
export { getMemoryThemes, getMemoryThemeTiers } from './themes.js';
export { getMemoryOperations, getMemoryOpsRich } from './ops.js';
export { getMemoryEncodingGate, getMemoryGateRich } from './gate.js';
export { getMemoryOpenLoops } from './loops.js';
export { getMemoryActivity } from './activity.js';
export { getMemoryDecayPanels } from './decay.js';
export { getMemoryInjections } from './injections.js';
export { getMemoryInspect } from './inspect.js';
export { getMemoryEntities } from './entities.js';
export { getMemoryTimeline } from './timeline.js';
export { getMemorySessions } from './sessions.js';
export { getMemoryHealthDetail } from './health.js';
