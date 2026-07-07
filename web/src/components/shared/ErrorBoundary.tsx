import * as React from 'react'
import { GlassCard } from '@/components/glass/GlassCard'
import { PageHeader } from '@/components/glass/PageHeader'
import { Button } from '@/components/ui/button'
import { AccentWord } from '@/components/glass/AccentWord'

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Top-level ErrorBoundary. Never let a render blow up the whole shell —
 * surface the error inside the same visual system so operators can retry.
 */
export class ErrorBoundary extends React.Component<
  React.PropsWithChildren,
  ErrorBoundaryState
> {
  constructor(props: React.PropsWithChildren) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Fire-and-forget console log — the app is single-tenant, no telemetry sink yet.
    console.error('Observatory ErrorBoundary caught:', error, info)
  }

  private reset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  override render(): React.ReactNode {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16">
        <PageHeader
          eyebrow="Something went sideways"
          title={
            <>
              We hit an <AccentWord gold>unexpected</AccentWord> error.
            </>
          }
          subtitle="The rest of the shell is fine — this panel took the fall. Retry, or reload if it sticks."
        />
        <GlassCard variant="strong" padding="lg" className="mt-4">
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-ink-muted">
            {this.state.error?.stack ?? this.state.error?.message ?? 'Unknown error'}
          </pre>
          <div className="mt-4 flex gap-2">
            <Button variant="primary" onClick={this.reset}>
              Try again
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reload
            </Button>
          </div>
        </GlassCard>
      </div>
    )
  }
}
