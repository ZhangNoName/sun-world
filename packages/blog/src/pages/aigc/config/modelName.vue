<template>
  <el-popover
    :show-arrow="false"
    placement="bottom-start"
    :width="200"
    trigger="click"
  >
    <template #reference>
      <z-btn type="ghost" class="model-name" title="选择模型">
        <span>{{ modelName }}</span>
        <SvgIcon name="select" width="16px" height="16px" />
      </z-btn>
    </template>
    <template #default>
      <div class="model-list">
        <div class="model-item" v-for="item in modelList" :key="item.value">
          <span>{{ item.name }}</span>
        </div>
      </div>
    </template>
  </el-popover>
</template>

<script lang="ts" setup name="modle-name">
import { ElPopover } from 'element-plus'
import ZBtn from '@/components/ZBtn/index.vue'
import { ref, computed } from 'vue'
import SvgIcon from '@/baseCom/SvgIcon/svgIcon.vue'

const props = defineProps<{
  model: string
}>()
const modelList = ref([
  {
    name: 'GPT-3.5 T',
    value: 'gpt-3.5-t',
  },
  {
    name: 'GPT-3.5 T',
    value: 'gpt-3.5-t',
  },
])
const modelName = computed(() => {
  return modelList.value.find((item) => item.value === props.model)?.name
})
</script>

<style scoped>
.el-button + .el-button {
  margin-left: 8px;
}
.model-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing);
  .model-item {
    color: var(--text-default);
    padding: 5px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.2s;
    &:hover {
      background-color: var(--bg-hover);
      color: var(--text-hover);
    }
    &.active {
      background-color: var(--bg-fill);
      color: var(--text-active);
    }
  }
}
</style>
