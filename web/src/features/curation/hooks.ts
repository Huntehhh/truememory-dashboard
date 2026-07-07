import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query'
import { fetchJson } from '@/lib/api'
import { keys } from '@/lib/queryClient'
import type { FeedEnvelope } from '@/features/feed/types'
import {
  createDirective,
  deleteDirective,
  forget,
  listDirectives,
  previewDeleteDirective,
  previewForget,
  previewRecategorize,
  recategorize,
} from './api'
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
 * TanStack Query hooks — curation reads + writes.
 *
 * Query keys extend the central factory locally (matches the pattern used by
 * `features/overview/hooks.ts`). Mutations invalidate every read that could
 * plausibly change after the write:
 *
 *   forget          → feed + kpi + curation queue
 *   recategorize    → feed + kpi + curation queue (category rollup shifts)
 *   directive add   → directives list
 *   directive del   → directives list + kpi (directive count)
 */

const curationKeys = {
  feed: (limit: number) => ['curation', 'feed', limit] as const,
  directives: () => ['curation', 'directives'] as const,
  previewForget: (id: number | null) =>
    ['curation', 'preview-forget', id] as const,
  previewRecat: (id: number | null) =>
    ['curation', 'preview-recategorize', id] as const,
  previewDeleteDirective: (id: number | null) =>
    ['curation', 'preview-delete-directive', id] as const,
}

// ── Review queue: read the memory feed (larger limit than the Feed page) ──

export function useCurationFeed(limit: number): UseQueryResult<FeedEnvelope> {
  return useQuery({
    queryKey: curationKeys.feed(limit),
    queryFn: () =>
      fetchJson<FeedEnvelope>(`/api/memory/feed?limit=${limit}`),
    // Fresh-enough for a review pass — no need to hammer while the operator
    // is sitting on a dialog. Focus refetch stays on so tab-switch pulls
    // any new writes.
    staleTime: 60_000,
  })
}

// ── Two-phase forget ────────────────────────────────────────────────────

/**
 * Preview query — enabled only when a memory is targeted. `staleTime: 0`
 * because the confirm token has a 60s server-side TTL; a cached-and-served
 * preview would hand the operator an already-expired token. Refetching on
 * every dialog open is cheap (the sidecar's engine is warm).
 */
export function usePreviewForget(
  memoryId: number | null,
): UseQueryResult<PreviewEnvelope> {
  return useQuery({
    queryKey: curationKeys.previewForget(memoryId),
    queryFn: () => previewForget(memoryId as number),
    enabled: memoryId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

export function useForget(): UseMutationResult<
  ForgetResponse,
  Error,
  { memoryId: number; confirmToken: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memoryId, confirmToken }) => forget(memoryId, confirmToken),
    onSuccess: () => {
      // Both the Feed page + our Review Queue read from /api/memory/feed —
      // invalidate the whole `feed` root so both re-fetch.
      void qc.invalidateQueries({ queryKey: keys.feed.all() })
      void qc.invalidateQueries({ queryKey: ['curation', 'feed'] })
      void qc.invalidateQueries({ queryKey: keys.overview.kpis() })
    },
  })
}

// ── Two-phase recategorize ─────────────────────────────────────────────

export function usePreviewRecategorize(
  memoryId: number | null,
): UseQueryResult<PreviewEnvelope> {
  return useQuery({
    queryKey: curationKeys.previewRecat(memoryId),
    queryFn: () => previewRecategorize(memoryId as number),
    enabled: memoryId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

export function useRecategorize(): UseMutationResult<
  RecategorizeResponse,
  Error,
  { memoryId: number; category: string; confirmToken: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ memoryId, category, confirmToken }) =>
      recategorize(memoryId, category, confirmToken),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.feed.all() })
      void qc.invalidateQueries({ queryKey: ['curation', 'feed'] })
      // The `/api/memory/feed-categories` list uses its own local key — nudge
      // that too so the Feed page's chip counts reflect the new category.
      void qc.invalidateQueries({ queryKey: ['feed', 'categories'] })
      void qc.invalidateQueries({ queryKey: keys.overview.kpis() })
    },
  })
}

// ── Directives ──────────────────────────────────────────────────────────

export function useDirectives(): UseQueryResult<DirectivesEnvelope> {
  return useQuery({
    queryKey: curationKeys.directives(),
    queryFn: listDirectives,
    staleTime: 30_000,
  })
}

export function useCreateDirective(): UseMutationResult<
  DirectiveCreateResponse,
  Error,
  { content: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ content }) => createDirective(content),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: curationKeys.directives() })
      void qc.invalidateQueries({ queryKey: keys.overview.kpis() })
    },
  })
}

export function usePreviewDeleteDirective(
  directiveId: number | null,
): UseQueryResult<DirectivePreviewEnvelope> {
  return useQuery({
    queryKey: curationKeys.previewDeleteDirective(directiveId),
    queryFn: () => previewDeleteDirective(directiveId as number),
    enabled: directiveId !== null,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  })
}

export function useDeleteDirective(): UseMutationResult<
  DirectiveDeleteResponse,
  Error,
  { directiveId: number; confirmToken: string }
> {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ directiveId, confirmToken }) =>
      deleteDirective(directiveId, confirmToken),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: curationKeys.directives() })
      void qc.invalidateQueries({ queryKey: keys.overview.kpis() })
    },
  })
}
