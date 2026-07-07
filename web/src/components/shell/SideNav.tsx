import { NavLink } from 'react-router-dom'
import {
  NAV_GROUP_LABEL,
  NAV_GROUP_ORDER,
  PAGES,
  type NavGroup,
  type PageDef,
} from '@/config'
import { AccentWord } from '@/components/glass/AccentWord'
import { Eyebrow } from '@/components/glass/Eyebrow'
import { cn } from '@/lib/utils'

/**
 * SideNav — slim left rail. Glass surface, pill nav items, grouped by
 * NAV_GROUP_ORDER. NavLink is used so react-router handles active state.
 */
export function SideNav(): React.ReactElement {
  const byGroup = groupPages(PAGES)

  return (
    <aside
      className={cn(
        'sticky top-0 flex h-[100dvh] w-60 flex-shrink-0 flex-col',
        'border-r border-[color:var(--line)] bg-[color:var(--surface)]',
        'backdrop-blur-[var(--blur-card)]',
      )}
      aria-label="Primary navigation"
    >
      <div className="flex items-center gap-2 px-5 pt-5 pb-4">
        <BrandMark />
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-5">
        {NAV_GROUP_ORDER.map((group) => {
          const items = byGroup[group] ?? []
          if (items.length === 0) return null
          return (
            <div key={group} className="mt-4 first:mt-0">
              <Eyebrow className="px-3 pb-1.5">{NAV_GROUP_LABEL[group]}</Eyebrow>
              <ul className="flex flex-col gap-0.5">
                {items.map((page) => (
                  <NavItem key={page.key} page={page} />
                ))}
              </ul>
            </div>
          )
        })}
      </nav>
    </aside>
  )
}

function NavItem({ page }: { page: PageDef }): React.ReactElement {
  const Icon = page.icon
  return (
    <li>
      <NavLink
        to={page.path}
        end={page.path === '/'}
        className={({ isActive }) =>
          cn(
            'flex items-center gap-2 rounded-pill px-3 py-1.5 text-sm transition-colors',
            'text-ink-muted hover:bg-[color:var(--surface-strong)] hover:text-ink',
            isActive &&
              'bg-[color:var(--surface-strong)] text-ink shadow-[0_1px_0_var(--glass-border)_inset]',
          )
        }
      >
        <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
        <span className="truncate">{page.title}</span>
      </NavLink>
    </li>
  )
}

function BrandMark(): React.ReactElement {
  return (
    <div className="flex items-baseline gap-0.5 text-lg font-semibold tracking-tight text-ink">
      <span>True</span>
      <AccentWord>Memory</AccentWord>
      <span className="ml-2 mt-0.5 rounded-pill border border-[color:var(--glass-border)] bg-[color:var(--surface)] px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-muted">
        v2
      </span>
    </div>
  )
}

function groupPages(pages: readonly PageDef[]): Record<NavGroup, PageDef[]> {
  const empty: Record<NavGroup, PageDef[]> = {
    pulse: [],
    diagnose: [],
    understand: [],
    operate: [],
  }
  for (const p of pages) {
    empty[p.group].push(p)
  }
  return empty
}
