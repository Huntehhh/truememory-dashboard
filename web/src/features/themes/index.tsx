import { Compass } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function ThemesPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Understand"
      title="Themes"
      subtitle="Active memory themes with member counts, drift over time, and dominant entities."
      phase="Phase 4"
      icon={Compass}
    />
  )
}
