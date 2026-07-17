import type { BlogListItem } from '@/modules/blog/types'
import { BlogCard } from '@/modules/blog/ui/BlogCard'

export function Waterfall({
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

export default Waterfall
