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
import { inject, onMounted, ref } from 'vue'
import { CategoryResponse, TagResponse } from '@/service/baseRequest'
// 定义表单类型
interface BlogSearchForm {
  keyword: string
  category: string | undefined
  publishDate: string | undefined
}
const categoryList = inject<CategoryResponse[]>('categoryList', [])
const tagList = inject<TagResponse[]>('tagList', [])
// 表单数据
const form = ref<BlogSearchForm>({
  keyword: '',
  category: undefined,
  publishDate: undefined,
})

const categoryFormatter = (row, column, v: string, index) => {
  return categoryList.find((c) => c.id === v)?.name || ''
}
const tagFormatter = (row, column, v: string[], index) => {
  return (
    v.map((id) => categoryList.find((c) => c.id === id)?.name).join(',') || ''
  )
}

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
onMounted(() => {
  BlogTableColumns[2].formatter = categoryFormatter
  BlogTableColumns[3].formatter = tagFormatter
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
        :columns="BlogTableColumns"
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
  gap: 1rem;
}
</style>
