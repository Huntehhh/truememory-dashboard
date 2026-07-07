import { UserRoundSearch } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function EntitiesPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Understand"
      title="Entities"
      subtitle="People, projects, and concepts extracted across memories — cross-linked and count-ranked."
      phase="Phase 4"
      icon={UserRoundSearch}
    />
  )
}
