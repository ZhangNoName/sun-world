<script lang="ts" setup>
import { ElInputNumber, ElOption, ElSelect } from 'element-plus'
import { computed } from 'vue'
import { reactive } from 'vue'
import { ref } from 'vue'
const RenderOptions = ['div', 'canvas']
const prop = defineProps({})
const tileConfig = reactive({
  row: 5,
  col: 5,
  width: 16,
  height: 16,
})
const renderType = ref('div')
const canvasConfig = computed(() => {
  return {
    width: tileConfig.row * tileConfig.width,
    height: tileConfig.col * tileConfig.height,
  }
})
</script>

<template>
  <div class="game-tiles-page">
    <div>制作游戏需要的tiles</div>
    <div class="tiles-container">
      <div class="left">
        <div v-for="i in tileConfig.row" class="tile-row" key="`row-{i}`">
          <div
            v-for="j in tileConfig.col"
            :style="{
              width: tileConfig.width + 'px',
              height: tileConfig.height + 'px',
            }"
            class="tile-item tile-col"
            :key="`${i}-${j}`"
          ></div>
        </div>
      </div>
      <div class="right">
        <div class="config-item">
          <div class="label">渲染方式：</div>
          <div class="item">
            <ElSelect v-model="renderType" style="width: 10rem">
              <ElOption
                v-for="item in RenderOptions"
                :key="item"
                :label="item"
                :value="item"
              />
            </ElSelect>
          </div>
        </div>
        <div class="config-item">
          <div class="label">画布大小：</div>
          <div class="item">
            <!-- <div>宽</div> -->
            <ElInputNumber v-model="tileConfig.row" :min="1" :max="100" />
            <div>×</div>
            <ElInputNumber v-model="tileConfig.col" :min="1" :max="100" />
            <div>
              {{ canvasConfig.width + 'px × ' + canvasConfig.height + 'px' }}
            </div>
          </div>
        </div>
        <div class="config-item">
          <div class="label">瓦片大小：</div>
          <div class="item">
            <!-- <div>宽</div> -->
            <ElInputNumber v-model="tileConfig.width" :min="10" :max="100" />
            <div>×</div>
            <ElInputNumber v-model="tileConfig.height" :min="10" :max="100" />
          </div>
        </div>
        <div class="config-item">
          <div class="label">导入已有tiles：</div>
        </div>
        <div class="config-item"></div>
        <div class="config-item"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.game-tiles-page {
  width: 100%;
  /* height: 100%; */
  height: calc(100vh - 37rem);

  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  .tiles-container {
    flex: auto;
    display: flex;
    gap: 1rem;
    overflow: auto;
    .left {
      max-width: 50%;
      max-height: 100%;
      padding: 1rem;
      flex: auto;
      background-color: beige;
      display: flex;
      flex-direction: column;
      gap: 1rem;
      overflow: auto;
      .tile-row {
        display: flex;
        gap: 0.5rem;
        .tile-item {
          flex: none;
          background-color: blanchedalmond;
        }
      }
    }
    .right {
      background-color: antiquewhite;
      width: 50%;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      justify-content: stretch;
      gap: 1rem;
      .config-item {
        display: flex;
        align-items: center;
        gap: 1rem;
        .item {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
      }
    }
  }
}
</style>
