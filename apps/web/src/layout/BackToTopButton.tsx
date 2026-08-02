import { useEffect, useState } from 'react'
import { SunIcon } from '@sun-world/icons/react'
import { Button } from '@sun-world/base-ui/button'

const SHOW_AFTER_PX = 360

type BackToTopButtonProps = {
  resetKey: string
}

export function BackToTopButton({ resetKey }: BackToTopButtonProps) {
  const [scrollRoot, setScrollRoot] = useState<HTMLElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.app-container')
    if (!root) return
    setScrollRoot(root)
    const updateVisibility = () => setVisible(root.scrollTop > SHOW_AFTER_PX)
    updateVisibility()
    root.addEventListener('scroll', updateVisibility, { passive: true })
    return () => root.removeEventListener('scroll', updateVisibility)
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
        const reduceMotion = window.matchMedia?.(
          '(prefers-reduced-motion: reduce)'
        ).matches
        scrollRoot.scrollTo({
          top: 0,
          behavior: reduceMotion ? 'auto' : 'smooth',
        })
      }}
    >
      <SunIcon name="arrow" />
    </Button>
  )
}
