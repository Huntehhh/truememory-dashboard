import { LayoutDashboard } from 'lucide-react'
import { ComingSoon } from '@/components/shared/ComingSoon'
import { AccentWord } from '@/components/glass/AccentWord'

export default function OverviewPage(): React.ReactElement {
  return (
    <ComingSoon
      eyebrow="Pulse"
      title={
        <>
          Observatory <AccentWord gold>overview</AccentWord>
        </>
      }
      subtitle="KPIs, injections signal, and a live health strip once the endpoints wire in."
      phase="Phase 2"
      icon={LayoutDashboard}
    />
  )
}
