<script lang="ts" setup>
import { ElInputNumber } from 'element-plus'
import { reactive } from 'vue'
import { ref } from 'vue'

const prop = defineProps({})
const tileConfig = reactive({
  x: 5,
  y: 5,
  width: 16,
  height: 16,
})
</script>

<template>
  <div class="game-tiles-page">
    <div>制作游戏需要的tiles</div>
    <div class="tiles-container">
      <div class="left"></div>
      <div class="right">
        <div class="config-item">
          <div class="label">画布大小：</div>
          <div class="item">
            <ElInputNumber v-model="tileConfig.x" :min="1" :max="100" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-tiles-page {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  .tiles-container {
    flex: auto;
    display: flex;
    gap: 1rem;
    .left {
      flex: auto;
      background-color: beige;
    }
    .right {
      background-color: antiquewhite;
      width: 50%;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: stretch;
      .config-item {
        display: flex;
        align-items: center;
        gap: 1rem;
      }
    }
  }
}
</style>
