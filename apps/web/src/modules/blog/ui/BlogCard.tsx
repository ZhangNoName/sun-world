import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SunIcon } from '@sun-world/icons/react'
import { Badge } from '@sun-world/ui/tag'
import { Button } from '@sun-world/ui/button'

import type { BlogCardProps } from '../types'

export function BlogCard(props: BlogCardProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const open = () => navigate(`/blog/${encodeURIComponent(props.id)}`)
  return (
    <article
      className="z-blog-card"
      role="link"
      tabIndex={0}
      onClick={open}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') open()
      }}
    >
      <div className="blog-meta z-blog-card__meta">
        <span>
          <SunIcon name="calendar" size={16} />
          {props.publishTime}
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
      <Button
        className="z-blog-card__action"
        type="button"
        aria-label={`${t('readMore')}: ${props.title}`}
        onClick={(event) => {
          event.stopPropagation()
          open()
        }}
      >
        <span>{t('readMore')}</span>
        <SunIcon name="chevron-right" size={17} />
      </Button>
    </article>
  )
}
