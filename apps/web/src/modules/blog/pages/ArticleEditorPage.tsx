import { Button } from '@sun-world/ui/button'
import { Input } from '@sun-world/ui/input'
import { SunMarkdownEditor } from '@/shared/markdown'
import { useBlogAuthoring } from '../composables/useBlogAuthoring'

export function ArticleEditorPage() {
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
        <Input
          value={authoring.title}
          onValueChange={authoring.setTitle}
          placeholder="标题"
          maxLength={100}
        />
        <select
          value={authoring.blogCategory}
          onChange={(event) => authoring.setBlogCategory(event.target.value)}
          aria-label="文章分类"
        >
          <option value="">请选择文章分类</option>
          {authoring.categoryList.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
        <select
          multiple
          value={authoring.blogTag.map(String)}
          onChange={(event) =>
            authoring.setBlogTag(
              Array.from(event.target.selectedOptions, (option) => option.value)
            )
          }
          aria-label="文章标签"
        >
          {authoring.tagList.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </div>
      <SunMarkdownEditor
        value={authoring.blogContent}
        onChange={(value) => authoring.setBlogContent(value ?? '')}
      />
    </main>
  )
}

export default ArticleEditorPage
