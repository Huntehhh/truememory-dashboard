import { fetchJson } from '@/lib/api'
import type {
  DirectiveCreateResponse,
  DirectiveDeleteResponse,
  DirectivePreviewEnvelope,
  DirectivesEnvelope,
  ForgetResponse,
  PreviewEnvelope,
  RecategorizeResponse,
} from './types'

/**
 * Sidecar wire calls — all POST/DELETE go through the `/api/sim/*` proxy
 * which Vite (dev) + Express (prod) rewrite to the FastAPI sidecar on
 * 127.0.0.1:8504. Never call :8504 directly from app code.
 *
 * Verified against sidecar/tm_sidecar/curation.py + directives.py on
 * 2026-07-07 with a live sidecar running the 0.7.6.2 engine.
 */

// ── Two-phase forget ────────────────────────────────────────────────────

export async function previewForget(memoryId: number): Promise<PreviewEnvelope> {
  return fetchJson<PreviewEnvelope>('/api/sim/curation/preview-forget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memory_id: memoryId }),
  })
}

export async function forget(
  memoryId: number,
  confirmToken: string,
): Promise<ForgetResponse> {
  return fetchJson<ForgetResponse>('/api/sim/curation/forget', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memory_id: memoryId, confirm_token: confirmToken }),
  })
}

// ── Two-phase recategorize ─────────────────────────────────────────────

export async function previewRecategorize(
  memoryId: number,
): Promise<PreviewEnvelope> {
  return fetchJson<PreviewEnvelope>('/api/sim/curation/preview-recategorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memory_id: memoryId }),
  })
}

export async function recategorize(
  memoryId: number,
  category: string,
  confirmToken: string,
): Promise<RecategorizeResponse> {
  return fetchJson<RecategorizeResponse>('/api/sim/curation/recategorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      memory_id: memoryId,
      category,
      confirm_token: confirmToken,
    }),
  })
}

// ── Directives ──────────────────────────────────────────────────────────

export async function listDirectives(): Promise<DirectivesEnvelope> {
  return fetchJson<DirectivesEnvelope>('/api/sim/directives')
}

export async function createDirective(
  content: string,
): Promise<DirectiveCreateResponse> {
  return fetchJson<DirectiveCreateResponse>('/api/sim/directives', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, user_id: '' }),
  })
}

export async function previewDeleteDirective(
  directiveId: number,
): Promise<DirectivePreviewEnvelope> {
  return fetchJson<DirectivePreviewEnvelope>(
    `/api/sim/directives/preview-delete/${directiveId}`,
  )
}

export async function deleteDirective(
  directiveId: number,
  confirmToken: string,
): Promise<DirectiveDeleteResponse> {
  return fetchJson<DirectiveDeleteResponse>(
    `/api/sim/directives/${directiveId}`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm_token: confirmToken }),
    },
  )
}
