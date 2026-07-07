import * as React from 'react'
import { useCallback, useEffect, useRef } from 'react'
import { Play } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { SimulateSkip } from './api'

/**
 * QueryComposer — hero-adjacent input strip for the simulator.
 *
 *   +--------------------------------------------------------+
 *   |  [ textarea — hypothetical prompt ]                    |
 *   |                                                        |
 *   |  Limit  ( 5 )( 10 )( 20 )   [ ] Reranker (slow)        |
 *   |                             [x] Salience guard         |
 *   |                             [x] Surprise boost         |
 *   |                                        [ Run ]         |
 *   +--------------------------------------------------------+
 *
 * Toggle semantics: UI ON = "run this stage" (operator mental model). The
 * wire uses `skip.<stage> = true` to mean "do not run". Inversion happens
 * exactly once, in the parent page's submit handler — the composer emits
 * a boolean per stage using the human-friendly name.
 */

export interface QueryComposerValue {
  query: string
  limit: number
  /** UI-space booleans. `true` == the stage runs. */
  runReranker: boolean
  runSalienceGuard: boolean
  runSurpriseBoost: boolean
}

export interface QueryComposerProps {
  value: QueryComposerValue
  onChange: (next: QueryComposerValue) => void
  onSubmit: () => void
  isRunning: boolean
}

const LIMIT_CHOICES = [5, 10, 20] as const

export function QueryComposer({
  value,
  onChange,
  onSubmit,
  isRunning,
}: QueryComposerProps): React.ReactElement {
  const textRef = useRef<HTMLTextAreaElement>(null)

  const canSubmit = value.query.trim().length > 0 && !isRunning

  const submit = useCallback((): void => {
    if (!canSubmit) return
    onSubmit()
  }, [canSubmit, onSubmit])

  // Cmd/Ctrl+Enter from anywhere inside the composer — matches the muscle
  // memory of the platform Enter-to-send elsewhere on the dashboard.
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
      const cmdEnter = (e.metaKey || e.ctrlKey) && e.key === 'Enter'
      if (cmdEnter) {
        e.preventDefault()
        submit()
      }
    },
    [submit],
  )

  // Auto-focus on mount so a fresh visit to /simulator can start typing
  // immediately. Idempotent — StrictMode's double-invoke is a no-op.
  useEffect(() => {
    textRef.current?.focus()
  }, [])

  const update = <K extends keyof QueryComposerValue>(
    key: K,
    v: QueryComposerValue[K],
  ): void => {
    onChange({ ...value, [key]: v })
  }

  return (
    <GlassCard variant="default" padding="lg" className="mb-6">
      <label
        htmlFor="sim-query"
        className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-ink-muted"
      >
        Prompt
      </label>
      <textarea
        ref={textRef}
        id="sim-query"
        placeholder="Type a hypothetical prompt — e.g. what is my preferred Python path?"
        value={value.query}
        onChange={(e) => update('query', e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        spellCheck={false}
        className={cn(
          'w-full resize-y rounded-xl border border-[color:var(--glass-border)]',
          'bg-[color:var(--surface)] px-4 py-3 text-sm leading-relaxed text-ink',
          'placeholder:text-ink-muted/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
          'font-mono',
        )}
      />

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <LimitPills
          value={value.limit}
          onChange={(n) => update('limit', n)}
          disabled={isRunning}
        />

        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <ToggleField
            label="Reranker"
            caption="hooks skip this for latency — first ON run is slow while the model loads"
            checked={value.runReranker}
            onCheckedChange={(v) => update('runReranker', v)}
            disabled={isRunning}
          />
          <ToggleField
            label="Salience guard"
            caption="drop memories below the recall floor"
            checked={value.runSalienceGuard}
            onCheckedChange={(v) => update('runSalienceGuard', v)}
            disabled={isRunning}
          />
          <ToggleField
            label="Surprise boost"
            caption="re-weight toward novel memories"
            checked={value.runSurpriseBoost}
            onCheckedChange={(v) => update('runSurpriseBoost', v)}
            disabled={isRunning}
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden font-mono text-[10px] uppercase tracking-widest text-ink-muted md:inline">
            {isMac() ? '⌘' : 'Ctrl'} + Enter
          </span>
          <Button
            variant="primary"
            size="md"
            onClick={submit}
            disabled={!canSubmit}
            aria-label="Run simulation"
          >
            <Play className="h-3.5 w-3.5" aria-hidden />
            {isRunning ? 'Running…' : 'Run'}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

// ── Toggle field with label + caption ──────────────────────────────────

function ToggleField({
  label,
  caption,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string
  caption: string
  checked: boolean
  onCheckedChange: (v: boolean) => void
  disabled?: boolean
}): React.ReactElement {
  const id = React.useId()
  return (
    <div className="flex items-start gap-2.5">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
      />
      <label htmlFor={id} className="max-w-[220px] cursor-pointer leading-tight">
        <span className="block text-xs font-medium text-ink">{label}</span>
        <span className="mt-0.5 block text-[11px] text-ink-muted">
          {caption}
        </span>
      </label>
    </div>
  )
}

// ── Limit pill segmented control ───────────────────────────────────────

function LimitPills({
  value,
  onChange,
  disabled,
}: {
  value: number
  onChange: (n: number) => void
  disabled?: boolean
}): React.ReactElement {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
        Limit
      </span>
      <div
        className={cn(
          'inline-flex items-center gap-1 rounded-pill border border-[color:var(--glass-border)]',
          'bg-[color:var(--surface)] p-1 text-ink-muted backdrop-blur-[var(--blur-card)]',
        )}
        role="group"
        aria-label="Result limit"
      >
        {LIMIT_CHOICES.map((n) => {
          const active = n === value
          return (
            <button
              type="button"
              key={n}
              onClick={() => onChange(n)}
              disabled={disabled}
              className={cn(
                'inline-flex h-7 items-center rounded-pill px-3 font-mono text-[10px] font-medium uppercase tracking-widest transition',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
                'disabled:opacity-50',
                active
                  ? 'bg-[color:var(--surface-strong)] text-ink shadow-[0_1px_0_var(--glass-border)_inset]'
                  : 'hover:text-ink',
              )}
              aria-pressed={active}
            >
              {n}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}

/** UI booleans ↔ wire skip flags. */
export function toWireSkip(v: QueryComposerValue): SimulateSkip {
  return {
    reranker: !v.runReranker,
    salience_guard: !v.runSalienceGuard,
    surprise_boost: !v.runSurpriseBoost,
  }
}
