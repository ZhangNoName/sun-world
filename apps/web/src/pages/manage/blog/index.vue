<script lang="ts" setup>
import {
  ElMessage,
  ElTable,
  ElTableColumn,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElDatePicker,
} from 'element-plus'
import SunForm from '@/components/Form/index.vue'
import SunTable from '@/components/Table/index.vue'
import { BlogTableColumns, BlogSearchFormData } from './data'
import { computed, onMounted, ref } from 'vue'
import { useBlogBaseData } from '@/modules/blog/composables/useBlogBaseData'
// 定义表单类型
interface BlogSearchForm {
  keyword: string
  category: string | undefined
  publishDate: string | undefined
}
const { categoryList, tagList, loadBlogBaseData } = useBlogBaseData()
// 表单数据
const form = ref<BlogSearchForm>({
  keyword: '',
  category: undefined,
  publishDate: undefined,
})

// 表单校验规则
const rules = {
  keyword: [{ max: 30, message: '关键字不能超过30字符', trigger: 'blur' }],
}

// 表单引用
const formRef = ref()

// 提交方法
const onSubmit = () => {
  formRef.value?.validate((valid: boolean) => {
    if (valid) {
      ElMessage.success('查询成功!')
      console.log('提交的表单数据:', form.value)
    } else {
      ElMessage.error('请检查输入内容')
    }
  })
}

// 重置方法
const onReset = () => {
  formRef.value?.resetFields()
}

const blogTableColumns = computed(() => {
  const categoryNameMap = new Map(
    categoryList.map((item) => [String(item.id), item.name])
  )
  const tagNameMap = new Map(tagList.map((item) => [String(item.id), item.name]))

  return BlogTableColumns.map((column, index) => {
    if (index === 2) {
      return {
        ...column,
        formatter: (row: unknown, column: unknown, v: unknown) =>
          categoryNameMap.get(String(v)) || '',
      }
    }

    if (index === 3) {
      return {
        ...column,
        formatter: (row: unknown, column: unknown, v: unknown) => {
          if (!Array.isArray(v)) return ''
          return v.map((id) => tagNameMap.get(String(id)) || '').join(',') || ''
        },
      }
    }

    return column
  })
})

onMounted(() => {
  loadBlogBaseData().catch((error) => {
    console.error('获取博客基础数据失败:', error)
  })
})
</script>

<template>
  <div class="manage-blog">
    <div class="top">
      <SunForm ref="formRef" :list="BlogSearchFormData" :initialValues="form" />
    </div>
    <div class="mid"></div>
    <div class="bootom">
      <SunTable
        :columns="blogTableColumns"
        :tableOptions="{
          showIndex: false,
          showSelection: true,
        }"
        url="/blogs"
        style="width: 100%"
      ></SunTable>
    </div>
  </div>
</template>

<style scoped>
.manage-blog {
  height: 100%;

  display: grid;
  grid-template-rows: 25rem 2.5rem auto;
  grid-template-columns: auto;
  gap: var(--horizontalGapPx);
}
</style>
