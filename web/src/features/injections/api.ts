import { fetchJson } from '@/lib/api'

/**
 * Injection row mirrored from tm_injections — one entry per hook fire
 * (SessionStart / UserPromptSubmit / Stop / Compact / SmokeTest).
 *
 * Server shape lives in src/server/queries/types.ts::MemoryInjectionRow;
 * kept in sync by hand since the dashboard and web tsconfigs don't share.
 * Verified against a live 8503 GET /api/memory/injections?limit=50 response
 * on 2026-07-07 — all field names and null semantics match.
 */
export interface InjectionRow {
  id: number
  ts: string | null
  hook: string
  session_id: string | null
  action: string | null
  memory_count: number | null
  char_count: number | null
  query: string | null
  preview: string | null
  full_content: string | null
  extra: Record<string, unknown> | null
}

export interface InjectionsResponse {
  limit: number
  data: InjectionRow[]
}

/** GET /api/memory/injections?limit=N — no server-side hook filter yet. */
export async function fetchInjections(limit: number): Promise<InjectionsResponse> {
  return fetchJson<InjectionsResponse>(`/api/memory/injections?limit=${limit}`)
}
