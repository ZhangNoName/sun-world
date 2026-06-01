<script lang="ts" setup name="SunTable">
import { ref, defineProps, watch, computed, watchEffect } from 'vue'
import {
  ElButton,
  ElPagination,
  ElTableColumn,
  ElTable,
  TableColumnCtx,
} from 'element-plus'
import {
  DEFAULT_PAGE_CONFIG,
  DEFAULT_TABLE_OPTIONS,
  SunTableProps,
  CLOUMN_WIDTH,
} from './type'
import { getDataByPage } from '@/service/manageRequest'

const props = withDefaults(defineProps<SunTableProps>(), {
  loading: false,
  tableConfig: () => ({}),
  tableOptions: () => ({ ...DEFAULT_TABLE_OPTIONS }), // 复制默认值，避免被修改
  pageConfig: () => ({ ...DEFAULT_PAGE_CONFIG }),
  url: '',
})

const loading = ref(props.loading || false)
const selectedRows = ref<any[]>([])
const tableData = ref<any[]>([])

const handleSelectionChange = (selection: any[]) => {
  selectedRows.value = selection
}
// 分页配置
const paginationConfig = ref({
  ...props.pageConfig,
  pageSize: 10,
  currentPage: 1,
  total: 0,
  pageSizes: [10, 20, 50, 100],
})
const indexMethod = (index: number) => {
  return index + 1
}

const tableOptions = computed(() => {
  return {
    ...DEFAULT_TABLE_OPTIONS,
    ...props.tableOptions,
  }
})
// 监听父组件传入的分页配置
watch(
  () => props.tableOptions,
  (newVal) => {
    if (newVal) {
      paginationConfig.value = {
        ...paginationConfig.value,
        pageSize: newVal.pageSize || paginationConfig.value.pageSize,
        currentPage: newVal.currentPage || paginationConfig.value.currentPage,
        total: newVal.total || paginationConfig.value.total,
      }
    }
  },
  { deep: true }
)

watchEffect(() => {
  console.log('出发变化')
  getDataByPage(props.url, {
    page_size: paginationConfig.value.pageSize,
    page: paginationConfig.value.currentPage,
  }).then((res) => {
    console.log('表格数据更新', res)
    tableData.value = res.list
  })
})
</script>

<template>
  <div class="sun-table">
    <!-- 表格 -->
    <ElTable
      v-bind="tableConfig"
      :data="tableData"
      :loading="loading"
      @selection-change="handleSelectionChange"
    >
      <!-- 多选框列（可选） -->
      <ElTableColumn
        v-if="tableOptions?.showSelection"
        type="selection"
        class-name="sun-table-select"
        :width="CLOUMN_WIDTH['selection']"
        align="center"
      />
      <!-- 序号框列（可选） -->
      <ElTableColumn
        v-if="tableOptions?.showIndex"
        type="index"
        label="序号"
        class-name="sun-table-index"
        :width="CLOUMN_WIDTH['index']"
        align="center"
        :index="indexMethod"
      />

      <!-- 动态列 -->
      <ElTableColumn
        v-for="column in columns"
        :key="column.prop"
        v-bind="column"
      ></ElTableColumn>

      <!-- 操作列（可选） -->
      <ElTableColumn
        v-if="tableOptions?.actions?.length"
        label="操作"
        align="center"
        fixed="right"
      >
        <template #default="scope">
          <ElButton
            v-for="action in tableOptions.actions"
            :key="action.label"
            :type="action.type || 'primary'"
            @click="() => action.handler(scope.row)"
          >
            {{ action.label }}
          </ElButton>
        </template>
      </ElTableColumn>
    </ElTable>

    <!-- 分页组件（可选） -->
    <div class="sun-table-pagination">
      <span class="pagination-total">共 {{ tableOptions.total }} 条数据</span>
      <ElPagination
        v-if="tableOptions.showPagination"
        v-bind="paginationConfig"
        v-model:page-size="paginationConfig.pageSize"
        v-model:current-page="paginationConfig.currentPage"
      ></ElPagination>
    </div>
  </div>
</template>

<style scoped>
.sun-table {
  width: 100%;
  /* :deep(.sun-table-index) {
    width: 100px;
    background-color: #fff;
  }
  :deep(.sun-table-select) {
    width: 15rem;
  } */
  .sun-table-pagination {
    width: 100%;
    height: 8rem;
    display: flex;
    justify-content: flex-end;
    align-items: center;
    gap: var(--horizontalGapPx);
  }
}
/* :deep(.sun-table-index) {
  width: 100px;
} */
</style>
