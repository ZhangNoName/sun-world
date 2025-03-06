<script lang="ts" setup name="SunTable">
import { ref, defineProps, watch } from 'vue'
import type { ElTable, TableColumnCtx } from 'element-plus'

interface TableColumn {
  label: string
  prop: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
}

interface TableAction {
  label: string
  type?: 'primary' | 'success' | 'warning' | 'danger' | 'info'
  size?: 'large' | 'medium' | 'small' | 'mini'
  handler: (row: any) => void
}

const props = defineProps<{
  columns: TableColumn[]
  data: Record<string, any>[]
  loading?: boolean
  tableConfig?: Partial<InstanceType<typeof ElTable>>
  tableOptions?: {
    showSelection?: boolean
    showPagination?: boolean
    actions?: TableAction[]
    pageSize?: number
    currentPage?: number
    total?: number
  }
}>()

const loading = ref(props.loading || false)
const selectedRows = ref<any[]>([])

const handleSelectionChange = (selection: any[]) => {
  selectedRows.value = selection
}

// 分页配置
const paginationConfig = ref({
  pageSize: props.tableOptions?.pageSize || 10,
  currentPage: props.tableOptions?.currentPage || 1,
  total: props.tableOptions?.total || 0,
  layout: 'total, sizes, prev, pager, next, jumper',
  pageSizes: [10, 20, 50, 100],
})

const handleSizeChange = (size: number) => {
  paginationConfig.value.pageSize = size
  emit('update:pageSize', size)
}

const handleCurrentChange = (page: number) => {
  paginationConfig.value.currentPage = page
  emit('update:currentPage', page)
}

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
</script>

<template>
  <div class="custom-table">
    <!-- 表格 -->
    <el-table
      v-bind="tableConfig"
      :data="data"
      :loading="loading"
      @selection-change="handleSelectionChange"
    >
      <!-- 多选框列（可选） -->
      <el-table-column
        v-if="tableOptions?.showSelection"
        type="selection"
        width="50"
      />

      <!-- 动态渲染列 -->
      <el-table-column
        v-for="col in columns"
        :key="col.prop"
        :prop="col.prop"
        :label="col.label"
        :width="col.width"
        :align="col.align || 'left'"
        :sortable="col.sortable || false"
      >
        <template #default="scope">
          <slot :name="col.prop" :row="scope.row" :index="scope.$index">
            {{ scope.row[col.prop] }}
          </slot>
        </template>
      </el-table-column>

      <!-- 操作列（可选） -->
      <el-table-column
        v-if="tableOptions?.actions?.length"
        label="操作"
        align="center"
        fixed="right"
        width="150"
      >
        <template #default="scope">
          <el-button
            v-for="action in tableOptions.actions"
            :key="action.label"
            :type="action.type || 'primary'"
            :size="action.size || 'small'"
            @click="() => action.handler(scope.row)"
          >
            {{ action.label }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页组件（可选） -->
    <el-pagination
      v-if="tableOptions?.showPagination"
      v-bind="paginationConfig"
      @size-change="handleSizeChange"
      @current-change="handleCurrentChange"
    />
  </div>
</template>

<style scoped>
.custom-table {
  width: 100%;
}
</style>
