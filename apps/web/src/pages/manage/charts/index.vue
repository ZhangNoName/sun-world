<script lang="ts" setup>
import { defineComponent, ref } from 'vue'
import ChartsCard from '@/components/ChartsCard/index.vue'
const statistics = ref([
  { title: 'Statistic 1', value: 100 },
  { title: 'Statistic 2', value: 200 },
  { title: 'Statistic 3', value: 300 },
  { title: 'Statistic 4', value: 400 },
])

const charts = ref([
  {
    options: {
      /* chart options for chart 1 */
    },
  },
  {
    options: {
      /* chart options for chart 2 */
    },
  },
  {
    options: {
      /* chart options for chart 3 */
    },
  },
  {
    options: {
      /* chart options for chart 4 */
    },
  },
])
</script>

<template>
  <div class="statistics-page">
    <div class="statistics-header">
      <div
        class="statistic-item"
        v-for="(item, index) in statistics"
        :key="index"
      >
        <h3>{{ item.title }}</h3>
        <p>{{ item.value }}</p>
      </div>
    </div>
    <div class="charts-grid">
      <ChartsCard />
      <ChartsCard />
      <ChartsCard />
      <ChartsCard />
      <!-- <div class="chart-item" v-for="(chart, index) in charts" :key="index">
        <div :options="chart.options"></div>
      </div> -->
    </div>
  </div>
</template>

<style scoped>
.statistics-page {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.statistics-header {
  display: flex;
  justify-content: space-between;
}

.statistic-item {
  flex: 1;
  text-align: center;
}

.charts-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
}

.chart-item {
  width: 100%;
  height: 300px;
}
</style>
