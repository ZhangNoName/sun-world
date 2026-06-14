<script lang="ts" setup>
import SunForm from '@/components/Form/index.vue'
import SunTable from '@/components/Table/index.vue'
import { onMounted } from 'vue'
import { useBlogManagement } from '@/modules/blog/composables/useBlogManagement'

const {
  blogSearchFormData,
  form,
  formRef,
  blogTableColumns,
  initializeBlogManagement,
} = useBlogManagement()

onMounted(() => {
  initializeBlogManagement()
})
</script>

<template>
  <div class="manage-blog">
    <div class="top">
      <SunForm ref="formRef" :list="blogSearchFormData" :initialValues="form" />
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
