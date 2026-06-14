<script setup lang="ts" name="VideoPlayer">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import Artplayer, { type Option } from 'artplayer'
import artplayerPluginDocumentPip from 'artplayer-plugin-document-pip'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'

const props = defineProps<{ option: Partial<Option> }>()
const emit = defineEmits(['getInstance'])

const art = shallowRef<Artplayer | null>(null)
const $container = ref<HTMLDivElement | null>(null)

onMounted(() => {
  art.value = new Artplayer({
    ...props.option,

    url: props.option.url as string,
    container: $container.value as HTMLDivElement,
    lang: 'zh-cn',
  })
  emit('getInstance', art.value)
})

onBeforeUnmount(() => {
  art.value?.destroy(false)
})
</script>

<template>
  <div class="sw-player-container">
    <div class="player-container">
      <div class="player" ref="$container" />
    </div>
    <div class="footer">
      <div class="left"></div>
      <div class="danmuku-input">
        <input type="text" />
        <button>发送</button>
      </div>
    </div>
  </div>
</template>
<style scoped>
.sw-player-container {
  width: 100%;
  height: 100%;

  overflow: hidden;
  .player-container {
    width: 100%;
    aspect-ratio: 16/9;
    height: calc(100% - 50px);

    .player {
      width: 100%;
      height: 100%;
    }
  }
  .footer {
    height: 50px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 13px 0 20px;

    background: var(--bg-page);
    .danmuku-input {
      height: 34px;
    }
  }
}
</style>
