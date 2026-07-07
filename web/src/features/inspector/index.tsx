import * as React from 'react'
import { useParams } from 'react-router-dom'
import { AccentWord } from '@/components/glass/AccentWord'
import { PageHeader } from '@/components/glass/PageHeader'
import { InspectorLanding } from './Landing'
import { InspectorDetail } from './Detail'

/**
 * Inspector entry — routes.tsx wires this to both `/inspector` (no id) and
 * `/inspector/:id` (single memory). We read the param here and dispatch
 * inside the same lazy chunk so both routes share the code split, and the
 * detail page owns its own header (with the memory id + prev/next arrows).
 */
export default function InspectorPage(): React.ReactElement {
  const params = useParams<{ id?: string }>()

  if (params.id !== undefined) {
    return <InspectorDetail />
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Diagnose"
        title={
          <>
            Memory <AccentWord gold>inspector.</AccentWord>
          </>
        }
        subtitle="Pick a memory to see it in full — content, connections, nearest neighbors, and the raw embedding."
      />
      <InspectorLanding />
    </div>
  )
}
