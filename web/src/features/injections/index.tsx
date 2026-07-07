import { Sparkles } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function InjectionsPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Pulse"
      title="Injections"
      subtitle="Real-time feed of what TrueMemory injected into the current context — reranker scores, sources, and outcomes."
      phase="Phase 2"
      icon={Sparkles}
    />
  )
}
