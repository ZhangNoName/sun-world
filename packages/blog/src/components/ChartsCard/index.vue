<script lang="ts" setup>
// 创建 ECharts 实例的 ref
import { ref, onMounted, watch } from 'vue'
import * as echarts from 'echarts'
import { DefaultChartOptions } from './config'
// 定义 props 类型
interface Props {
  options: echarts.EChartsOption
}

// 设置默认 props 值
const props = withDefaults(defineProps<Props>(), {
  options: () => DefaultChartOptions,
})

const chartInstance = ref<echarts.ECharts | null>(null)
const chartRef = ref<HTMLDivElement | null>(null)

// 监听 props.options 的变化，动态更新 ECharts 配置
watch(
  () => props.options,
  (newOptions) => {
    if (chartInstance.value) {
      chartInstance.value.setOption(newOptions)
    }
  },
  { deep: true } // 深度监听，确保配置变化能被捕捉
)

onMounted(() => {
  if (chartRef.value) {
    // 创建 ECharts 实例
    chartInstance.value = echarts.init(chartRef.value as HTMLDivElement)
    // 设置初始配置
    chartInstance.value.setOption(props.options)
  }
})
</script>

<template>
  <div ref="chartRef" style="width: 100%; height: 400px"></div>
</template>

<style scoped></style>
