import { lazy, Suspense } from 'react'
import { createBrowserRouter, Navigate, type RouteObject } from 'react-router-dom'
import { AppShell } from '@/components/shell/AppShell'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import { RouteFallback } from '@/components/shared/RouteFallback'
import { PlaceholderRoute } from '@/components/shared/PlaceholderRoute'
import { FEATURE_PAGE_KEYS, PAGES, ROUTER_BASENAME, type PageDef } from '@/config'

/* Lazy-loaded feature routes. Each is code-split so the initial bundle stays lean. */
const OverviewPage = lazy(() => import('@/features/overview'))
const InjectionsPage = lazy(() => import('@/features/injections'))
const FeedPage = lazy(() => import('@/features/feed'))
const SimulatorPage = lazy(() => import('@/features/simulator'))
const InspectorPage = lazy(() => import('@/features/inspector'))
const CurationPage = lazy(() => import('@/features/curation'))
const ThemesPage = lazy(() => import('@/features/themes'))
const OpsPage = lazy(() => import('@/features/ops'))
const AgingPage = lazy(() => import('@/features/aging'))
const EntitiesPage = lazy(() => import('@/features/entities'))
const SessionsPage = lazy(() => import('@/features/sessions'))

const FEATURE_COMPONENTS: Record<string, React.LazyExoticComponent<React.ComponentType>> = {
  overview: OverviewPage,
  injections: InjectionsPage,
  feed: FeedPage,
  simulator: SimulatorPage,
  inspector: InspectorPage,
  curation: CurationPage,
  themes: ThemesPage,
  health: OpsPage,
  aging: AgingPage,
  entities: EntitiesPage,
  sessions: SessionsPage,
}

function withSuspense(node: React.ReactNode): React.ReactElement {
  return <Suspense fallback={<RouteFallback />}>{node}</Suspense>
}

function elementForPage(page: PageDef): React.ReactElement {
  if (FEATURE_PAGE_KEYS.has(page.key)) {
    const Cmp = FEATURE_COMPONENTS[page.key]
    if (Cmp) return withSuspense(<Cmp />)
  }
  return withSuspense(<PlaceholderRoute page={page} />)
}

const childRoutes: RouteObject[] = PAGES.map((page) => {
  const path = page.path === '/' ? undefined : page.path.replace(/^\//, '')
  if (path === undefined) {
    return {
      index: true,
      element: elementForPage(page),
    }
  }
  return {
    path,
    element: elementForPage(page),
  }
})

// Inspector detail — same lazy component as the /inspector base, dispatches
// on `useParams().id` internally. Kept as a manual push so `PAGES` stays the
// SoT for nav-visible routes.
childRoutes.push({
  path: 'inspector/:id',
  element: withSuspense(<InspectorPage />),
})

// Catch-all — send unknown routes home.
childRoutes.push({
  path: '*',
  element: <Navigate to="/" replace />,
})

export const router = createBrowserRouter(
  [
    {
      path: '/',
      element: (
        <ErrorBoundary>
          <AppShell />
        </ErrorBoundary>
      ),
      children: childRoutes,
    },
  ],
  { basename: ROUTER_BASENAME },
)
