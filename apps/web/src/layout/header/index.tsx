import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { SunIcon } from '@sun-world/icons/react'

import Avator from '@/components/Avator/avator'
import LanguageSwitch from '@/components/LanguageSwitch'
import ThemeSwitch from '@/components/ThemeSwitch'

const links = [
  ['canvas', '/canvas', '画布'],
  ['message-circle', '/aigc', 'AI 对话'],
  ['edit', '/new_article', '撰写文章'],
] as const

export function Header() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString('zh-CN', { hour12: false }))
    update()
    const timer = window.setInterval(update, 1000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <header className="z-header">
      <Link to="/" className="brand">
        <img src="/logo.svg" alt="Sun World" />
        <span>Sun World</span>
      </Link>
      <nav aria-label="快捷导航">
        {links.map(([icon, path, label]) => (
          <Link key={path} to={path} aria-label={label}>
            <SunIcon name={icon} />
          </Link>
        ))}
        <a
          href="https://github.com/ZhangNoName"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        <LanguageSwitch />
        <ThemeSwitch />
        <Avator />
      </nav>
      <time>{time}</time>
    </header>
  )
}

export default Header
