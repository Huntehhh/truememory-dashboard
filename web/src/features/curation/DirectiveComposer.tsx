import * as React from 'react'
import { Plus } from 'lucide-react'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useCreateDirective } from './hooks'
import { useToast } from './ToastContext'

/**
 * Add-directive composer — textarea + submit. Cmd/Ctrl+Enter submits from
 * anywhere inside, matching the muscle memory of the Simulator composer.
 *
 * Copy on the label is deliberately factual (see `curation.twoPhase` for the
 * why-audit-log rationale); the composer does not author explainer prose
 * beyond what the glossary already provides.
 */

export function DirectiveComposer(): React.ReactElement {
  const [content, setContent] = React.useState('')
  const createM = useCreateDirective()
  const { push } = useToast()
  const textRef = React.useRef<HTMLTextAreaElement>(null)

  const trimmed = content.trim()
  const canSubmit = trimmed.length > 0 && !createM.isPending

  const submit = (): void => {
    if (!canSubmit) return
    createM.mutate(
      { content: trimmed },
      {
        onSuccess: (res) => {
          const id =
            typeof res.id === 'number'
              ? `#${res.id}`
              : typeof res['memory_id'] === 'number'
                ? `#${res['memory_id']}`
                : '(id unavailable)'
          push({
            tone: 'success',
            title: 'Directive added',
            detail: `Auto-loads at every future SessionStart · ${id}`,
          })
          setContent('')
          textRef.current?.focus()
        },
        onError: (err) => {
          push({
            tone: 'error',
            title: "Couldn't add directive",
            detail: err instanceof Error ? err.message : 'Unknown error',
          })
        },
      },
    )
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    const cmdEnter = (e.metaKey || e.ctrlKey) && e.key === 'Enter'
    if (cmdEnter) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <MetricTip
          id="kpi.directives"
          trigger="underline"
          label={
            <span className="font-mono text-[10px] uppercase tracking-widest text-ink-muted">
              New directive
            </span>
          }
        />
      </div>
      <textarea
        ref={textRef}
        placeholder='e.g. Always link to the source paper alongside a summary.'
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        rows={3}
        spellCheck
        className={cn(
          'w-full resize-y rounded-xl border border-[color:var(--glass-border)]',
          'bg-[color:var(--surface)] px-4 py-3 text-sm leading-relaxed text-ink',
          'placeholder:text-ink-muted/70',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70',
        )}
      />
      <div className="flex items-center justify-between gap-3">
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-ink-muted md:inline">
          {isMac() ? '⌘' : 'Ctrl'} + Enter to submit
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setContent('')}
            disabled={content.length === 0 || createM.isPending}
          >
            Clear
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={!canSubmit}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {createM.isPending ? 'Adding…' : 'Add directive'}
          </Button>
        </div>
      </div>
    </GlassCard>
  )
}

function isMac(): boolean {
  if (typeof navigator === 'undefined') return false
  return /Mac|iPod|iPhone|iPad/.test(navigator.platform)
}
