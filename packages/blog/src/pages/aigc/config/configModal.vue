<script setup lang="ts" name="config-modal">
import { ref, reactive } from 'vue'
import { ElDialog, ElForm, ElFormItem, ElInput } from 'element-plus'
import { SettingSvg } from '@sun-world/icons'
import ZBtn from '@/components/ZBtn/index.vue'
import ZInput from '@/baseCom/input/input.vue'
import type { FormInstance } from 'element-plus'

const formRef = ref<FormInstance>()
const open = ref(false)
const handleClose = () => {
  open.value = false
}
const form = reactive({
  token: '',
})
const rules = reactive({
  token: [{ required: true, message: '请输入Token' }],
})

const submitForm = (formEl: FormInstance | undefined) => {
  if (!formEl) return
  formEl.validate((valid) => {
    if (valid) {
      console.log('submit!', valid)
    } else {
      console.log('error submit!')
    }
  })
}

const resetForm = (formEl: FormInstance | undefined) => {
  if (!formEl) return
  formEl.resetFields()
  handleClose()
}
</script>

<template>
  <z-btn type="icon" size="icon" @click="open = true" title="设置">
    <SettingSvg #icon width="1.4rem" height="1.4rem" />
  </z-btn>
  <el-dialog
    width="500px"
    v-model="open"
    title="模型配置"
    class="config-modal"
    :before-close="handleClose"
  >
    <div class="config-modal-header">
      <el-form
        ref="formRef"
        style="max-width: 600px"
        :model="form"
        label-width="auto"
        class="demo-dynamic"
        :rules="rules"
      >
        <el-form-item label="Token" prop="token">
          <z-input v-model="form.token" />
        </el-form-item>
      </el-form>
    </div>
    <template #footer>
      <div class="dialog-footer">
        <z-btn type="outline" @click="resetForm(formRef)">取消</z-btn>
        <z-btn type="primary" @click="submitForm(formRef)">保存</z-btn>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
/* 注意：el-dialog 的宽度建议通过 :width 属性传递，而不是直接写在 .config-modal 类上，
因为 el-dialog 渲染后是挂载在 body 下的，scoped 样式可能失效 */

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
</style>
