import { Wand2 } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function SimulatorPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Diagnose"
      title="Retrieval simulator"
      subtitle="Try a query, see what would be retrieved and re-ranked. Compare configs side-by-side."
      phase="Phase 3"
      icon={Wand2}
    />
  )
}
