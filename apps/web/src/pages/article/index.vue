<script lang="ts" setup>
import { inject, onMounted, ref } from 'vue'
import { ElMessage, ElInput, ElSelect, ElOption } from 'element-plus'
import ZBtn from '@/components/ZBtn/index.vue'
import { BlogEditorClass } from '@/blogEditor'
import { createBlog } from '@/modules/blog/api'
import { getBlogErrorMessage } from '@/modules/blog/errors'
import type {
  CategoryResponse,
  CreateBlogPayload,
  TagResponse,
} from '@/modules/blog/types'

defineProps({
  id: { type: String, default: '' },
})

const categoryList = inject<CategoryResponse[]>('categoryList', [])
const tagList = inject<TagResponse[]>('tagList', [])

const editorEle = ref<HTMLElement | null>(null)
const blogWordCount = ref(0)
const blogEditor = ref<BlogEditorClass>(new BlogEditorClass())
const blogCategory = ref('')
const blogTag = ref<string[]>([])
const title = ref('')
const saving = ref(false)

const saveBlog = async () => {
  if (saving.value) return
  if (title.value.trim() === '') {
    ElMessage.error('标题不能为空')
    return
  }

  const content = blogEditor.value.getContent() || ''
  const tags = blogTag.value.map((tagId) => {
    const item = tagList.find((i) => String(i.id) === String(tagId))
    return item
      ? tagId
      : {
          name: tagId.toString(),
        }
  })

  const params: CreateBlogPayload = {
    title: title.value.trim(),
    content,
    abstract: content.substring(0, 100),
    author: 'test',
    category: blogCategory.value,
    tag: tags,
  }

  saving.value = true
  try {
    await createBlog(params)
    ElMessage.success('保存成功')
  } catch (error) {
    ElMessage.error(getBlogErrorMessage(error))
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (!editorEle.value) return

  blogEditor.value.init(editorEle.value)
  ;(window as unknown as { blogEditor?: BlogEditorClass }).blogEditor =
    blogEditor.value

  blogEditor.value.setConfig({
    input: (value) => {
      blogWordCount.value = value.length
    },
  })
})
</script>

<template>
  <div class="article-page">
    <div class="func-bar">
      <div class="stastic">{{ '统计信息：字数  ' + blogWordCount }}</div>
      <div class="btn-container">
        <ZBtn :disabled="saving" @click="saveBlog">
          {{ saving ? '保存中...' : $t('save') }}
        </ZBtn>
      </div>
    </div>

    <div class="title-container">
      <ElInput
        class="title-input"
        placeholder="标题"
        maxlength="100"
        clearable
        show-word-limit
        v-model="title"
      />
      <ElSelect v-model="blogCategory" placeholder="请选择文章种类">
        <ElOption
          v-for="item in categoryList"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </ElSelect>
      <ElSelect
        v-model="blogTag"
        placeholder="请选择标签"
        allow-create
        multiple
        filterable
        :reserve-keyword="false"
      >
        <ElOption
          v-for="item in tagList"
          :key="item.id"
          :label="item.name"
          :value="item.id"
        />
      </ElSelect>
    </div>

    <div ref="editorEle" class="editor-container"></div>
  </div>
</template>

<style scoped>
.article-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  align-items: stretch;
  gap: var(--space-3);
  padding: var(--space-4);
}

.func-bar {
  min-height: 3rem;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.stastic {
  flex: 1;
  color: var(--text-secondary);
}

.btn-container {
  display: flex;
  justify-content: flex-end;
  gap: var(--horizontalGapPx);
  align-items: center;
}

.title-container {
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(160px, 1fr) minmax(160px, 1fr);
  align-items: center;
  gap: var(--space-3);
}

.editor-container {
  flex: 1;
  min-height: 360px;
}

@media screen and (max-width: 768px) {
  .article-page {
    padding: var(--space-3) 0 var(--space-6);
  }

  .func-bar,
  .title-container {
    padding-inline: var(--horizontalGapPx);
  }

  .func-bar {
    align-items: stretch;
    flex-direction: column;
  }

  .btn-container {
    justify-content: stretch;
  }

  .title-container {
    grid-template-columns: 1fr;
  }

  .editor-container {
    min-height: 420px;
  }
}
</style>
