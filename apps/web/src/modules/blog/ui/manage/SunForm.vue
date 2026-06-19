<!-- ElFormComponent.vue -->
<script lang="ts" setup name="SunForm">
import { ref, reactive, watchEffect } from 'vue'
import type { PropType } from 'vue'
import { FormItem } from './formTypes'
import { SunDatePicker } from '@sun-world/ui/date-picker'
import { SunInput } from '@sun-world/ui/input'
import {
  ElSelect,
  ElCheckboxGroup,
  ElForm,
  ElFormItem,
  FormProps,
  ElOption,
  ElCheckbox,
} from 'element-plus'

const props = defineProps<{
  list: FormItem[]
  initialValues?: Record<string, any> // 支持传入初始化表单值
  formConfig?: FormProps
}>()

const formRef = ref<InstanceType<typeof ElForm> | null>(null) // 用于获取 el-form 实例

// 使用 defineExpose 公开 formRef 给父组件
defineExpose({
  formRef,
})

// 响应式表单数据
const formData = reactive<Record<string, any>>({ ...props.initialValues })
</script>

<template>
  <ElForm
    :model="formData"
    label-width="120px"
    label-position="right"
    v-bind="formConfig"
    ref="formRef"
  >
    <ElFormItem
      v-for="item in list"
      :key="item.key"
      :label="item.label"
      :prop="item.key"
    >
      <!-- 输入框 -->
      <SunInput
        v-if="item.type === 'input'"
        v-model="formData[item.key]"
        type="text"
        :placeholder="`请输入${item.label}`"
        clearable
        v-bind="item.config"
      />

      <!-- 下拉选择 -->
      <ElSelect
        v-else-if="item.type === 'select'"
        v-model="formData[item.key]"
        :placeholder="`请选择${item.label}`"
        clearable
      >
        <ElOption
          v-for="opt in item.options"
          :key="opt.value"
          :label="opt.label"
          :value="opt.value"
        />
      </ElSelect>

      <!-- 日期选择 -->
      <SunDatePicker
        v-else-if="item.type === 'date'"
        v-model="formData[item.key]"
        :placeholder="`选择${item.label}`"
        v-bind="item.config"
      />

      <!-- 复选框 -->
      <ElCheckboxGroup
        v-else-if="item.type === 'checkbox'"
        v-model="formData[item.key]"
      >
        <ElCheckbox
          v-for="opt in item.options"
          :key="opt.value"
          :label="opt.value"
        >
          {{ opt.label }}
        </ElCheckbox>
      </ElCheckboxGroup>
    </ElFormItem>
  </ElForm>
</template>

<style scoped>
.el-form {
  max-width: 800px;

  :deep(.el-date-editor) {
    width: 100%;
  }

  .el-checkbox-group {
    line-height: normal;
  }
}
</style>
