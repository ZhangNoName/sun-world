import { useEffect, useState } from 'react'
import { Inspector } from 'react-dev-inspector'

export function ReactSourceInspector() {
  const [active, setActive] = useState(false)

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setActive(true)
    }
    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === 'Alt') setActive(false)
    }
    const deactivate = () => setActive(false)

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', deactivate)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
      window.removeEventListener('blur', deactivate)
    }
  }, [])

  return <Inspector active={active} keys={null} onActiveChange={setActive} />
}
