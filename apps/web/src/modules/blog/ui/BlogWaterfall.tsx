import type { BlogListItem } from '../types'
import { BlogCard } from './BlogCard'

export function BlogWaterfall({
  list,
  columnCount = 3,
}: {
  list: BlogListItem[]
  columnCount?: number
}) {
  return (
    <section className="waterfall-grid" style={{ columnCount }}>
      {list.map((item) => (
        <div className="waterfall-item" key={item.id}>
          <BlogCard {...item} />
        </div>
      ))}
    </section>
  )
}

export default BlogWaterfall
