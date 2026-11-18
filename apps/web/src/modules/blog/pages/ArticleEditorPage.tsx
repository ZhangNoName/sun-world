import { SwButton as Button } from '@sun-world/ui/sw-button'
import { SwInput } from '@sun-world/ui/sw-input'
import { SwSelect } from '@sun-world/ui/sw-select'
import { SunMarkdownEditor } from '@/shared/markdown'
import { AdminRouteGuard } from '@/modules/admin/components/AdminRouteGuard'
import { useBlogAuthoring } from '../composables/useBlogAuthoring'
import '../styles/blog-experience.css'

export function ArticleEditorPage() {
  return (
    <AdminRouteGuard>
      <ArticleEditorContent />
    </AdminRouteGuard>
  )
}

function ArticleEditorContent() {
  const authoring = useBlogAuthoring()
  return (
    <main className="article-page">
      <div className="func-bar">
        <span>统计信息：字数 {authoring.blogWordCount}</span>
        <Button
          loading={authoring.saving}
          onClick={() => void authoring.saveBlog()}
        >
          保存
        </Button>
      </div>
      <div className="title-container">
        <SwInput
          aria-label="文章标题"
          value={authoring.title}
          onValueChange={authoring.setTitle}
          placeholder="标题"
          maxLength={100}
        />
        <SwSelect
          label="文章分类"
          value={String(authoring.blogCategory)}
          onValueChange={authoring.setBlogCategory}
          options={[
            { value: '', label: '请选择文章分类' },
            ...authoring.categoryList.map((item) => ({
              value: String(item.id),
              label: item.name,
            })),
          ]}
        />
        <SwSelect
          multiple
          label="文章标签"
          placeholder="请选择文章标签"
          value={authoring.blogTag.map(String)}
          onValueChange={authoring.setBlogTag}
          options={authoring.tagList.map((item) => ({
            value: String(item.id),
            label: item.name,
          }))}
        />
      </div>
      <SunMarkdownEditor
        value={authoring.blogContent}
        onChange={(value) => authoring.setBlogContent(value ?? '')}
      />
    </main>
  )
}

export default ArticleEditorPage
