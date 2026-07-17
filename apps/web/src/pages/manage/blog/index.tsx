import { Link } from 'react-router'
import { SunButton } from '@sun-world/ui/button'
import { SunInput } from '@sun-world/ui/input'
import { SunPagination } from '@sun-world/ui/pagination'
import { SunSelect } from '@sun-world/ui/select'
import { useBlogManagement } from '@/modules/blog/composables/useBlogManagement'

export function ManageBlogPage() {
  const blog = useBlogManagement()
  const categoryNames = new Map(
    blog.categories.map((item) => [item.id, item.name])
  )
  const tagNames = new Map(blog.tags.map((item) => [item.id, item.name]))
  return (
    <section className="manage-section">
      <header className="section-heading">
        <div>
          <h1>博客管理</h1>
          <p>查询、检查并进入文章编辑流程。</p>
        </div>
        <Link className="manage-link" to="/write">
          新建文章
        </Link>
      </header>
      <form
        className="admin-filters"
        onSubmit={(event) => {
          event.preventDefault()
          void blog.submit()
        }}
      >
        <SunInput
          label="标题关键词"
          value={blog.keyword}
          onValueChange={blog.setKeyword}
          maxLength={31}
          placeholder="最多 30 个字符"
        />
        <SunSelect
          label="排序字段"
          value={blog.sortBy}
          onValueChange={(value) => blog.setSortBy(value as typeof blog.sortBy)}
          options={[
            { value: 'updated_at', label: '更新时间' },
            { value: 'created_at', label: '创建时间' },
            { value: 'view_num', label: '浏览量' },
          ]}
        />
        <SunSelect
          label="排序方向"
          value={blog.sortOrder}
          onValueChange={(value) =>
            blog.setSortOrder(value as typeof blog.sortOrder)
          }
          options={[
            { value: 'desc', label: '降序' },
            { value: 'asc', label: '升序' },
          ]}
        />
        <SunButton type="submit" loading={blog.loading}>
          查询
        </SunButton>
        <SunButton
          type="button"
          variant="ghost"
          onClick={() => void blog.reset()}
        >
          重置
        </SunButton>
      </form>
      {blog.validationMessage ? (
        <p className="admin-error" role="alert">
          {blog.validationMessage}
        </p>
      ) : null}
      {blog.errorMessage ? (
        <p className="admin-error" role="alert">
          {blog.errorMessage}
        </p>
      ) : null}
      <div className="table-scroll">
        <table className="manage-table">
          <thead>
            <tr>
              <th>标题</th>
              <th>分类</th>
              <th>标签</th>
              <th>字数</th>
              <th>评论</th>
              <th>浏览</th>
              <th>更新时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {blog.items.map((item) => (
              <tr key={item.id}>
                <td>{item.title}</td>
                <td>
                  {item.category == null
                    ? '-'
                    : categoryNames.get(item.category) || item.category}
                </td>
                <td>
                  {item.tag?.map((id) => tagNames.get(id) || id).join('、') ||
                    '-'}
                </td>
                <td>{item.byte_num}</td>
                <td>{item.comment_num}</td>
                <td>{item.view_num}</td>
                <td>
                  {item.updated_at
                    ? new Date(item.updated_at).toLocaleString('zh-CN')
                    : '-'}
                </td>
                <td>
                  <Link to={`/write?id=${item.id}`}>编辑</Link>
                </td>
              </tr>
            ))}
            {!blog.loading && !blog.items.length ? (
              <tr>
                <td colSpan={8} className="admin-empty">
                  暂无文章
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <SunPagination
        label="博客分页"
        page={blog.page}
        pageSize={blog.pageSize}
        total={blog.total}
        loading={blog.loading}
        onPageChange={(page) => void blog.changePage(page)}
      />
    </section>
  )
}
export default ManageBlogPage
