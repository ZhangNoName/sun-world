import { Button } from '@sun-world/ui/button'
import { NativeSelectField } from '@sun-world/ui/form-controls'
import { Input } from '@sun-world/ui/input'
import { SunMarkdownEditor } from '@/shared/markdown'
import { useBlogAuthoring } from '../composables/useBlogAuthoring'
import '../styles/blog-experience.css'

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
        <NativeSelectField
          label="文章分类"
          value={authoring.blogCategory}
          onChange={(event) => authoring.setBlogCategory(event.target.value)}
          options={[
            { value: '', label: '请选择文章分类' },
            ...authoring.categoryList.map((item) => ({
              value: String(item.id),
              label: item.name,
            })),
          ]}
        />
        <NativeSelectField
          multiple
          label="文章标签"
          value={authoring.blogTag.map(String)}
          onChange={(event) =>
            authoring.setBlogTag(
              Array.from(event.target.selectedOptions, (option) => option.value)
            )
          }
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
