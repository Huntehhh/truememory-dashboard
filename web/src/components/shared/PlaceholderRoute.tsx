import { ComingSoon } from './ComingSoon'
import type { PageDef } from '@/config'

/**
 * Generic route-body for pages in the registry that don't yet have a dedicated
 * `features/<page>` folder (timeline, gate). Reuses the ComingSoon presentation.
 */
export function PlaceholderRoute({
  page,
}: {
  page: PageDef
}): React.ReactElement {
  return (
    <ComingSoon
      eyebrow={page.eyebrow}
      title={page.title}
      subtitle="Feature folder scaffolds later — this route is registered so the nav rail stays complete."
      phase={page.phase}
      icon={page.icon}
    />
  )
}
