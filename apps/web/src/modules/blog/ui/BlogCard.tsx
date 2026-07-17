import { useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { SunIcon } from '@sun-world/icons/react'
import { SunTag } from '@sun-world/ui/tag'

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
      <div className="blog-meta">
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
      <h2>{props.title}</h2>
      <p>{props.abstract}</p>
      <div className="blog-tags">
        {props.tags.map((tag) => (
          <SunTag key={tag} label={tag} />
        ))}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          open()
        }}
      >
        {t('readMore')}…
      </button>
    </article>
  )
}
