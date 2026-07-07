import { FileSearch } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function InspectorPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Diagnose"
      title="Memory inspector"
      subtitle="Deep-dive on a single memory — text, embedding neighbors, salience trajectory, edit history."
      phase="Phase 3"
      icon={FileSearch}
    />
  )
}
