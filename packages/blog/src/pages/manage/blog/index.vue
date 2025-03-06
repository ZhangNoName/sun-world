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
import { blogSearchForm } from './data'
import { ref } from 'vue'
// 定义表单类型
interface BlogSearchForm {
  keyword: string
  category: string | undefined
  publishDate: string | undefined
}

// 表单数据
const form = ref<BlogSearchForm>({
  keyword: '',
  category: undefined,
  publishDate: undefined,
})

const tableData = [
  {
    date: '2016-05-03',
    name: 'Tom',
    address: 'No. 189, Grove St, Los Angeles',
  },
  {
    date: '2016-05-02',
    name: 'Tom',
    address: 'No. 189, Grove St, Los Angeles',
  },
  {
    date: '2016-05-04',
    name: 'Tom',
    address: 'No. 189, Grove St, Los Angeles',
  },
  {
    date: '2016-05-01',
    name: 'Tom',
    address: 'No. 189, Grove St, Los Angeles',
  },
]

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
</script>

<template>
  <div class="manage-blog">
    <div class="top">
      <SunForm ref="formRef" :list="blogSearchForm" :initialValues="form" />
    </div>
    <div class="mid"></div>
    <div class="bootom">
      <ElTable :data="tableData" style="width: 100%">
        <ElTableColumn prop="date" label="Date" width="180" />
        <ElTableColumn prop="name" label="Date" width="180" />
        <ElTableColumn prop="address" label="Date" width="180" />
      </ElTable>
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
