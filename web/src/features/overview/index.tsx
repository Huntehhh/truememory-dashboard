import * as React from 'react'
import { PageHeader } from '@/components/glass/PageHeader'
import { AccentWord } from '@/components/glass/AccentWord'
import { ActivityCard } from './ActivityCard'
import { CategoryCard } from './CategoryCard'
import { KpiStrip } from './KpiStrip'
import { useActivity, useByCategory, useKpi } from './hooks'

/**
 * Overview — the Pulse landing page. Hero + KPI strip + 12-week activity
 * heatmap + category distribution bars. Each card owns its own loading/error
 * state so the shell never flashes an empty page.
 */
export default function OverviewPage(): React.ReactElement {
  const kpi = useKpi()
  const activity = useActivity(84)
  const byCategory = useByCategory(30)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Observatory"
        title={
          <>
            Your memory, <AccentWord gold>witnessed.</AccentWord>
          </>
        }
        subtitle="The pulse of every write, retrieval, and quiet day — reflected against a live 12-week window."
      />

      <KpiStrip
        data={kpi.data}
        isLoading={kpi.isLoading}
        isError={kpi.isError}
        errorMessage={kpi.error instanceof Error ? kpi.error.message : undefined}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ActivityCard
            data={activity.data}
            isLoading={activity.isLoading}
            isError={activity.isError}
            errorMessage={
              activity.error instanceof Error ? activity.error.message : undefined
            }
          />
        </div>
        <div className="lg:col-span-2">
          <CategoryCard
            data={byCategory.data}
            isLoading={byCategory.isLoading}
            isError={byCategory.isError}
            errorMessage={
              byCategory.error instanceof Error ? byCategory.error.message : undefined
            }
          />
        </div>
      </div>
    </div>
  )
}
