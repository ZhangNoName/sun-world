<script lang="ts" setup>
import { inject, onMounted, ref } from 'vue'
import { BlogEditorClass } from '@/blogEditor'
import { ElMessage, ElInput, ElSelect, ElOption, ElTree } from 'element-plus'
import ZBtn from '@/components/ZBtn/index.vue'
import { getBlogById, postSaveBlog } from '@/service/request'
import { CategoryResponse, TagResponse } from '@/service/baseRequest'
const prop = defineProps({
  id: { type: String, default: '' },
})

const editorEle = ref()
const blogWordCount = ref(0)
const blogEditor = ref<BlogEditorClass>(new BlogEditorClass())
const blogCategory = ref('')
const blogTag = ref<string[]>([])
const saveBlog = async () => {
  if (title.value === '') return ElMessage.error('标题不能为空')

  const content = blogEditor.value.getContent() || ''
  // if (content.length < 50) return ElMessage.error('内容长度不少于50')
  const tags = blogTag.value.map((o) => {
    const item = tagList.find((i) => i.id == o)
    return item
      ? o
      : {
          name: o.toString(),
        }
  })
  const params = {
    title: title.value,
    content,
    abstract: content.substring(0, 100),
    author: 'test',
    category: blogCategory.value,
    tag: tags,
  }
  // console.log('保存博客', params)

  await postSaveBlog(params).then((res) => {
    // console.log('获取到返回的', res)
    ElMessage.success('保存成功')
  })
  // blogEditor?.value.save()
}

const categoryList = inject<CategoryResponse[]>('categoryList', [])
const tagList = inject<TagResponse[]>('tagList', [])

const title = ref('')

onMounted(() => {
  blogEditor.value.init(editorEle.value)
  // console.log(blogEditor)
  // 将blogEditor挂载到全局
  ;(window as any).blogEditor = blogEditor

  blogEditor.value.setConfig({
    input: (v) => {
      blogWordCount.value = v.length
    },
  })
  if (prop.id) {
    getBlogById(prop.id).then((res: any) => {
      // console.log('获取到的博客内容', res)
    })
  }
})
</script>

<template>
  <div class="article-page">
    <div class="func-bar">
      <div class="stastic">{{ '统计信息：字数  ' + blogWordCount }}</div>
      <div class="btn-container">
        <ZBtn @click="saveBlog">{{ $t('save') }}</ZBtn>
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
  align-items: center;
  gap: var(--horizontalGapPx);
  .func-bar {
    height: 3rem;
    width: 100%;
    display: flex;
    align-items: center;
    .stastic {
      flex: 1;
    }
    .btn-container {
      display: flex;
      justify-content: flex-end;
      gap: var(--horizontalGapPx);
      align-items: center;
    }
  }
  .title-container {
    height: 3rem;
    width: 100%;
    display: grid;
    /* justify-content: space-between; */
    grid-template-rows: auto;
    grid-template-columns: 3fr 1fr 1fr;
    align-items: center;
    gap: var(--horizontalGapPx);
  }
  .editor-container {
    flex: 1;
  }
}
</style>
