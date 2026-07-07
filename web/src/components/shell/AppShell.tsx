import { Outlet } from 'react-router-dom'
import { GradientBg } from '@/components/glass/GradientBg'
import { SideNav } from './SideNav'
import { ThemeToggle } from './ThemeToggle'
import { StatusBar } from './StatusBar'

/**
 * AppShell — top-level layout.
 *
 *   +--------------------------------------------------------+
 *   |             SideNav          |        TopBar            |
 *   |  (Pulse / Diagnose / etc.)   +--------------------------+
 *   |                              |                          |
 *   |                              |   <Outlet />             |
 *   +--------------------------------------------------------+
 *
 *  - Grid layout: fixed side rail + fluid main.
 *  - Uses 100dvh (never 100vh) so mobile chrome doesn't clip.
 *  - Ambient GradientBg pinned to viewport, main content scrolls above it.
 */
export function AppShell(): React.ReactElement {
  return (
    <div className="relative isolate flex min-h-[100dvh] w-full bg-bg text-ink">
      {/* Ambient background — sticks to viewport, sits behind everything. */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <GradientBg variant="hero" />
      </div>

      <SideNav />

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main
          className="flex-1 overflow-y-auto"
          style={{ maxHeight: 'calc(100dvh - 56px)' }}
        >
          <div className="mx-auto w-full max-w-6xl px-6 py-8 md:px-10">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

function TopBar(): React.ReactElement {
  return (
    <header
      className="sticky top-0 z-20 flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b border-[color:var(--line)] bg-[color:var(--surface)] px-6 backdrop-blur-[var(--blur-card)] md:px-10"
      role="banner"
    >
      <div className="flex items-center gap-3 text-sm text-ink-muted">
        <span className="font-mono text-[11px] uppercase tracking-widest">
          observatory
        </span>
      </div>
      <div className="flex items-center gap-3">
        <StatusBar />
        <ThemeToggle />
      </div>
    </header>
  )
}
