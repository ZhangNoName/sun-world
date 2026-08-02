import { useEffect, useRef, useState } from 'react'
import { Inspector } from 'react-dev-inspector'

export function ReactSourceInspector() {
  const [active, setActive] = useState(false)
  const altPressedRef = useRef(false)

  const handleInspectorActiveChange = (nextActive: boolean) => {
    if (nextActive) {
      setActive(altPressedRef.current)
      return
    }

    if (!altPressedRef.current) setActive(false)
  }

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        altPressedRef.current = true
        setActive(true)
      }
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') {
        altPressedRef.current = false
        setActive(false)
      }
    }
    const handleBlur = () => {
      altPressedRef.current = false
      setActive(false)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleBlur)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', handleBlur)
    }
  }, [])

  return (
    <Inspector
      active={active}
      keys={null}
      onActiveChange={handleInspectorActiveChange}
    />
  )
}
