import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SunIcon } from '@sun-world/icons/react'
import { Badge } from '@sun-world/ui/tag'

import type { BlogCardProps } from '../types'

export function BlogCard(props: BlogCardProps) {
  const { t } = useTranslation()
  return (
    <article className="z-blog-card">
      <div className="blog-meta z-blog-card__meta">
        <span>
          <SunIcon name="calendar" size={16} />
          {props.lastUpdateTime}
        </span>
        <span>
          <SunIcon name="message-circle" size={16} />
          {props.commentNum}
        </span>
        <span>
          <SunIcon name="file-text" size={16} />
          {props.byteNum}
        </span>
      </div>
      <h2 className="z-blog-card__title">{props.title}</h2>
      <p className="z-blog-card__excerpt">{props.abstract}</p>
      <div className="blog-tags">
        {props.tags.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </div>
      <Link
        className="z-blog-card__action"
        to={`/blog/${encodeURIComponent(props.id)}`}
        aria-label={`${t('readMore')}: ${props.title}`}
        onKeyDown={(event) => {
          if (event.key !== ' ') return
          event.preventDefault()
          event.currentTarget.click()
        }}
      >
        <span>{t('readMore')}</span>
        <SunIcon name="chevron-right" size={17} />
      </Link>
    </article>
  )
}
