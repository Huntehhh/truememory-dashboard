import { ListTree } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function SessionsPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Understand"
      title="Sessions"
      subtitle="Grouped chats with extraction counts, top themes, and drill-through to the memory feed."
      phase="Phase 4"
      icon={ListTree}
    />
  )
}
