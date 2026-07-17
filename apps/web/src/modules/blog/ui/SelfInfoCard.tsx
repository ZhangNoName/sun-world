import { useEffect } from 'react'

import { openGithub } from '@/util'
import { useBlogBaseData } from '../composables/useBlogBaseData'

export function SelfInfoCard() {
  const { stats, loadBlogBaseData } = useBlogBaseData()
  useEffect(() => {
    void loadBlogBaseData().catch(() => undefined)
  }, [loadBlogBaseData])
  return (
    <section className="self-card" aria-label="站点信息">
      <img src="/logo.svg" alt="Sun World" />
      <p>一个迷人的小屋</p>
      <dl>
        <div>
          <dt>文章</dt>
          <dd>{stats.blog_count}</dd>
        </div>
        <div>
          <dt>分类</dt>
          <dd>{stats.category_count}</dd>
        </div>
        <div>
          <dt>标签</dt>
          <dd>{stats.tag_count}</dd>
        </div>
        <div>
          <dt>浏览</dt>
          <dd>{stats.total_view_num}</dd>
        </div>
      </dl>
      <button type="button" onClick={openGithub}>
        GitHub
      </button>
      <p>有志者，事竟成</p>
    </section>
  )
}
