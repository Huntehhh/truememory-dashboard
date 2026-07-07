import { Activity } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function OpsPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Operate"
      title="Health"
      subtitle="Mirror lag, matview age, sidecar reachability, and the last N ingestion cycles."
      phase="Phase 5"
      icon={Activity}
    />
  )
}
