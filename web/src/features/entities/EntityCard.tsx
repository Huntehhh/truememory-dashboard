import { AccentWord } from '@/components/glass/AccentWord'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { GlassCard } from '@/components/glass/GlassCard'
import { MetricTip } from '@/components/glass/MetricTip'
import { StatBadge } from '@/components/glass/StatBadge'
import type { EntityRow } from './types'
import { asArray, asObject, asString, formatRelative } from './utils'

/**
 * EntityCard — one profile per entity: header (name + message count),
 * chip rows for traits / topics, a compact facts row for style, an optional
 * relationships JSON block, and a relative-time footer.
 *
 * Every JSON section is guarded by a shape check. If the backend fell back to
 * a raw string on parse fail, that string is rendered in an "unparsed" pre
 * block — nothing is silently dropped, nothing is guessed.
 *
 * The top card (`featured`) wraps the entity name in an <AccentWord gold>
 * for a warm brand accent. The corrupted upstream entity name (raw
 * `</user_id>` tags baked in from a bad extraction run) renders as-is via
 * `whitespace-pre-wrap break-all` — data honesty over prettiness.
 */

export interface EntityCardProps {
  row: EntityRow
  featured?: boolean
}

const CHIP_CLASS =
  'inline-flex rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface)] px-2 py-0.5 text-[11px] text-ink-muted'

const UNPARSED_PRE_CLASS =
  'whitespace-pre-wrap break-all rounded-md border border-[color:var(--glass-border)] bg-[color:var(--surface-strong)] p-2 font-mono text-[11px] text-ink-muted'

export function EntityCard({
  row,
  featured = false,
}: EntityCardProps): React.ReactElement {
  // ── traits ────────────────────────────────────────────────────────
  const traitsArr = asArray<unknown>(row.traits)
  const traitsFallback = traitsArr === null ? asString(row.traits) : null

  // ── topics ────────────────────────────────────────────────────────
  const topicsArr = asArray<unknown>(row.topics)
  const topicsFallback = topicsArr === null ? asString(row.topics) : null

  // ── communication_style ───────────────────────────────────────────
  const styleObj = asObject(row.communication_style)
  const styleFallback =
    styleObj === null ? asString(row.communication_style) : null

  const formality = styleObj ? asString(styleObj.formality) : null
  const avgLengthRaw = styleObj ? styleObj.avg_length : undefined
  const avgLength =
    typeof avgLengthRaw === 'number' && Number.isFinite(avgLengthRaw)
      ? avgLengthRaw
      : null
  const usesEmojiRaw = styleObj ? styleObj.uses_emoji : undefined
  const usesEmoji = typeof usesEmojiRaw === 'boolean' ? usesEmojiRaw : null
  const typicalGreetingRaw = styleObj
    ? asString(styleObj.typical_greeting)
    : null
  const typicalGreeting =
    typicalGreetingRaw && typicalGreetingRaw.length > 0
      ? typicalGreetingRaw
      : null

  const hasStyleData =
    formality !== null ||
    avgLength !== null ||
    usesEmoji !== null ||
    typicalGreeting !== null

  // ── relationships ─────────────────────────────────────────────────
  const relObj = asObject(row.relationships)
  const relFallback = relObj === null ? asString(row.relationships) : null
  const hasRelationships = relObj !== null && Object.keys(relObj).length > 0

  // ── header ────────────────────────────────────────────────────────
  const msgCount = row.message_count
  const msgCountLabel = msgCount == null ? '—' : msgCount.toLocaleString()
  const msgCountTone: 'navy' | 'neutral' = msgCount == null ? 'neutral' : 'navy'

  const nameNode = featured ? (
    <AccentWord gold>{row.entity}</AccentWord>
  ) : (
    row.entity
  )

  return (
    <GlassCard variant="default" padding="md" className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h3 className="min-w-0 whitespace-pre-wrap break-all text-lg font-semibold leading-tight tracking-tight text-ink">
          {nameNode}
        </h3>
        <MetricTip
          id="entities.profile"
          trigger="icon"
          className="flex-shrink-0"
          label={
            <StatBadge tone={msgCountTone} className="whitespace-nowrap">
              {msgCountLabel} msgs
            </StatBadge>
          }
        />
      </div>

      {traitsArr && traitsArr.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Eyebrow>Traits</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {traitsArr.map((t, i) => (
              <span key={i} className={CHIP_CLASS}>
                {String(t)}
              </span>
            ))}
          </div>
        </div>
      ) : traitsFallback ? (
        <UnparsedBlock label="Traits (unparsed)" raw={traitsFallback} />
      ) : null}

      {topicsArr && topicsArr.length > 0 ? (
        <div className="flex flex-col gap-2">
          <Eyebrow>Topics</Eyebrow>
          <div className="flex flex-wrap gap-1.5">
            {topicsArr.map((t, i) => (
              <span key={i} className={CHIP_CLASS}>
                {String(t)}
              </span>
            ))}
          </div>
        </div>
      ) : topicsFallback ? (
        <UnparsedBlock label="Topics (unparsed)" raw={topicsFallback} />
      ) : null}

      {hasStyleData ? (
        <div className="flex flex-col gap-2">
          <Eyebrow>Style</Eyebrow>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {formality ? (
              <StatBadge tone="gold" className="capitalize">
                {formality}
              </StatBadge>
            ) : null}
            {avgLength !== null ? (
              <span className="font-mono text-[11px] text-ink-muted">
                avg length: {Math.round(avgLength)}
              </span>
            ) : null}
            {usesEmoji !== null ? (
              <span className="font-mono text-[11px] text-ink-muted">
                emoji: {usesEmoji ? 'yes' : 'no'}
              </span>
            ) : null}
          </div>
          {typicalGreeting ? (
            <p className="font-serif italic text-sm text-ink">
              {typicalGreeting}
            </p>
          ) : null}
        </div>
      ) : styleFallback ? (
        <UnparsedBlock label="Style (unparsed)" raw={styleFallback} />
      ) : null}

      {hasRelationships ? (
        <div className="flex flex-col gap-2">
          <Eyebrow>Relationships</Eyebrow>
          <pre className={UNPARSED_PRE_CLASS}>
            {JSON.stringify(relObj, null, 2)}
          </pre>
        </div>
      ) : relFallback ? (
        <UnparsedBlock label="Relationships (unparsed)" raw={relFallback} />
      ) : null}

      <div className="mt-auto flex justify-end pt-1">
        <span
          className="font-mono text-[10px] uppercase tracking-widest text-ink-muted"
          title={row.updated_at ?? undefined}
        >
          {formatRelative(row.updated_at)}
        </span>
      </div>
    </GlassCard>
  )
}

interface UnparsedBlockProps {
  label: string
  raw: string
}

function UnparsedBlock({ label, raw }: UnparsedBlockProps): React.ReactElement {
  return (
    <div className="flex flex-col gap-2">
      <Eyebrow>{label}</Eyebrow>
      <pre className={UNPARSED_PRE_CLASS}>{raw}</pre>
    </div>
  )
}
