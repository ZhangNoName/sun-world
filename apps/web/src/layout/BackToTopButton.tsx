import { useEffect, useState } from 'react'
import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'

import { useReducedMotion } from '@/shared/design'

const SHOW_AFTER_PX = 360

type BackToTopButtonProps = {
  resetKey: string
}

export function BackToTopButton({ resetKey }: BackToTopButtonProps) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-container')
    if (!root) return
    setScrollRoot(root)
    let frame: number | undefined
    const commitVisibility = () => {
      frame = undefined
      const nextVisible = root.scrollTop > SHOW_AFTER_PX
      setVisible((current) => (current === nextVisible ? current : nextVisible))
    }
    const scheduleVisibility = () => {
      if (frame !== undefined) return
      frame = window.requestAnimationFrame(commitVisibility)
    }

    commitVisibility()
    root.addEventListener('scroll', scheduleVisibility, { passive: true })
    return () => {
      root.removeEventListener('scroll', scheduleVisibility)
      if (frame !== undefined) window.cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    setVisible(Boolean(scrollRoot && scrollRoot.scrollTop > SHOW_AFTER_PX))
  }, [resetKey, scrollRoot])

  if (!visible || !scrollRoot) return null

  return (
    <Button
      className="shell-back-to-top"
      type="button"
      size="icon"
      aria-label="返回顶部"
      title="返回顶部"
      onClick={() => {
        scrollRoot.scrollTo({
          top: 0,
          behavior: prefersReducedMotion ? 'auto' : 'smooth',
        })
      }}
    >
      <SunIcon name="arrow" />
    </Button>
  )
}
