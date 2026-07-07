import { useEffect } from 'react'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { GrainOverlay } from '@/components/glass/GrainOverlay'
import { queryClient } from '@/lib/queryClient'
import { router } from '@/routes'
import { applyThemeToDocument, useThemeStore } from '@/stores/theme'

export default function App(): React.ReactElement {
  const theme = useThemeStore((s) => s.theme)

  // Keep <html data-theme> mirrored to the store on every change.
  // The initial value is also applied by an inline script in index.html
  // to prevent a light-to-dark flash on first paint.
  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200} skipDelayDuration={80}>
        <GrainOverlay />
        <RouterProvider router={router} />
      </TooltipProvider>
    </QueryClientProvider>
  )
}
