import { useEffect, useRef } from 'react'

import { BlogHomeFeed } from '@/modules/blog/ui/BlogHomeFeed'
import { SelfInfoCard } from '@/modules/blog/ui/SelfInfoCard'
import {
  buildWebsiteJsonLd,
  canonicalUrl,
  useJsonLd,
  usePageMeta,
} from '@/shared/seo'
import { IcpFilingCard } from '../ui/IcpFilingCard'
import { WeatherCard } from '../ui/WeatherCard'
import './home-react.css'

export function HomePage() {
  const sidebar = useRef<HTMLElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  usePageMeta({
    title: 'Sun World',
    description: '记录全栈开发、AI、图形编辑器与工程实践的个人技术博客。',
    canonical: canonicalUrl('/'),
  })
  useJsonLd(buildWebsiteJsonLd(), 'website')

  useEffect(() => {
    if (!sentinel.current || !sidebar.current || !window.IntersectionObserver)
      return
    const observer = new IntersectionObserver(([entry]) => {
      if (!sidebar.current) return
      if (entry.isIntersecting) {
        const overflow = Math.max(
          sidebar.current.offsetHeight - window.innerHeight,
          -64
        )
        sidebar.current.style.top = `${-overflow}px`
      } else sidebar.current.style.removeProperty('top')
    })
    observer.observe(sentinel.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="home-page">
      <aside className="home-sidebar" ref={sidebar} aria-label="个人信息与天气">
        <SelfInfoCard />
        <WeatherCard />
        <IcpFilingCard className="desktop-icp-card" />
        <div ref={sentinel} />
      </aside>
      <BlogHomeFeed />
      <IcpFilingCard className="mobile-icp-card" />
    </div>
  )
}

export default HomePage
