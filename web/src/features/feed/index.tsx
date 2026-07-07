import { Waves } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function FeedPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Pulse"
      title="Memory feed"
      subtitle="Chronological stream of memory writes, edits, and retrievals with salience-tinted rows."
      phase="Phase 2"
      icon={Waves}
    />
  )
}
