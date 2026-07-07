import { Hourglass } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function AgingPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Operate"
      title="Aging"
      subtitle="Half-life decay curves, forgetting candidates, and re-consolidation history."
      phase="Phase 5"
      icon={Hourglass}
    />
  )
}
