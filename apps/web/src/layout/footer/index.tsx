import { useEffect, useState } from 'react'

export function Footer() {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const update = () =>
      setSeconds(
        Math.max(
          0,
          Math.floor(
            (Date.now() - new Date('2024-07-17T00:00:00+08:00').getTime()) /
              1000
          )
        )
      )
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])
  const days = Math.floor(seconds / 86400)
  return (
    <footer className="z-footer">
      <div>
        <strong>Sun World</strong>
        <span>© 2024–{new Date().getFullYear()}</span>
        <span>已运行 {days} 天</span>
      </div>
      <img src="/logo.svg" alt="" />
    </footer>
  )
}

export default Footer
