import { useEffect } from 'react'
import { Moon, SunMedium } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { applyThemeToDocument, useThemeStore } from '@/stores/theme'

/**
 * ThemeToggle — flips between "paper" and "ink". Applies the change to
 * <html data-theme> imperatively (plus persists via zustand middleware).
 */
export function ThemeToggle(): React.ReactElement {
  const theme = useThemeStore((s) => s.theme)
  const toggle = useThemeStore((s) => s.toggle)

  useEffect(() => {
    applyThemeToDocument(theme)
  }, [theme])

  const nextLabel = theme === 'paper' ? 'ink' : 'paper'

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-label={`Switch to ${nextLabel} theme`}
      title={`Switch to ${nextLabel} theme`}
    >
      {theme === 'paper' ? (
        <Moon className="h-4 w-4" aria-hidden />
      ) : (
        <SunMedium className="h-4 w-4" aria-hidden />
      )}
    </Button>
  )
}
