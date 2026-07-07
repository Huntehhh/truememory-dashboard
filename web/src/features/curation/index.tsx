import { ClipboardList } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'

export default function CurationPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Operate"
      title="Curation queue"
      subtitle="Duplicates, stale directives, and low-confidence writes awaiting review."
      phase="Phase 5"
      icon={ClipboardList}
    />
  )
}
