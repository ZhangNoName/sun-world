<script setup lang="ts" name="videoPage">
import {
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  shallowRef,
  watch,
} from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import Artplayer, { type Option } from 'artplayer'
import Hls from 'hls.js'
import artplayerPluginHlsControl from 'artplayer-plugin-hls-control'
import VideoPlayer from '@/components/Video/video.com.vue'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'
import artplayerPluginDocumentPip from 'artplayer-plugin-document-pip'
const route = useRoute()
const player = shallowRef<Artplayer | null>(null)

// 从路由参数获取视频 URL，如果没有则使用默认值
const videoUrl = ref<string>(
  (route.query.url as string) ||
    'https://sunworld.site/static/videos/3064f698-8e37-4792-b4bd-cbc365ca8ab9/master.m3u8'
)

const style = reactive({
  width: '100%',
  height: '100%',
})

function getInstance(art: Artplayer) {
  console.log('Artplayer instance:', art)
}

// 播放器配置选项
const option = reactive<Partial<Option>>({
  url: videoUrl.value,
  type: 'm3u8',
  // url: 'https://artplayer.org/assets/sample/video.mp4',
  autoSize: true,
  autoMini: true,
  playbackRate: true,
  aspectRatio: true,
  screenshot: true,
  setting: true,
  hotkey: true,

  mutex: true,
  backdrop: true,
  playsInline: true,
  autoPlayback: true,
  airplay: true,
  theme: '#ff6b6b',
  volume: 0.7,
  isLive: false,
  muted: false,
  autoplay: false,
  autoOrientation: true,
  fullscreen: true,
  fullscreenWeb: true,
  subtitleOffset: false,
  miniProgressBar: true,
  lock: true,
  fastForward: true,
  plugins: [
    artplayerPluginDocumentPip({
      //
    }),
    artplayerPluginDanmuku({
      danmuku: 'https://artplayer.org/assets/sample/danmuku.xml',
    }),
    artplayerPluginHlsControl({
      quality: {
        // Show qualitys in control
        control: true,
        // Show qualitys in setting
        setting: true,
        // Get the quality name from level
        getName: (level: any) => `${level.height}P`,
        // I18n
        title: 'Quality',
        auto: 'Auto',
      },
      audio: {
        // Show audios in control
        control: true,
        // Show audios in setting
        setting: true,
        // Get the audio name from track
        getName: (track: any) => track.name,
        // I18n
        title: 'Audio',
        auto: 'Auto',
      },
    }),
  ],
  contextmenu: [
    {
      html: '复制视频地址',
      click: function () {
        ElMessage.success('视频地址已复制')
      },
    },
  ],
  customType: {
    m3u8: function playM3u8(video, url, art) {
      if (Hls.isSupported()) {
        if (art.hls) art.hls.destroy()
        const hls = new Hls()
        hls.loadSource(url)
        hls.attachMedia(video)
        art.hls = hls
        art.on('destroy', () => hls.destroy())
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = url
      } else {
        art.notice.show = 'Unsupported playback format: m3u8'
      }
    },
  },
})
</script>
<template>
  <div class="video-page">
    <div class="left">
      <div class="video-container">
        <!-- <div v-if="isLoading" class="loading">
        <div class="loading-spinner"></div>
        <p>视频加载中...</p>
      </div>
      <div v-else-if="error" class="error">
        <p>{{ error }}</p>
        <button @click="initPlayer" class="retry-btn">重试</button>
      </div> -->
        <VideoPlayer :option="option" @get-instance="getInstance" />
      </div>
    </div>
    <div class="right">
      <div class="video-title">
        <h1>弹幕</h1>
      </div>
    </div>
  </div>
</template>
<style scoped>
.video-page {
  width: 100%;
  min-height: 100%;
  display: flex;
  padding: 0 10px;
  box-sizing: border-box;
  justify-content: center;
  .left {
    flex: 1;
    height: 100%;
    max-width: 1681px;
    /* 
    width: calc(100% - 350px - 30px);
    @media (min-width: 1681px) {
      width: calc(100% - 411px - 30px);
    } */
    .video-container {
      width: 100%;

      border-radius: 0 0 8px 8px;
      overflow: hidden;
      box-shadow: 0 0 8px rgba(0, 0, 0, 0.1);
    }
  }
  .right {
    margin-left: 30px;
    width: 350px;
    height: 100%;

    border-radius: 8px;

    @media (min-width: 1681px) {
      width: 411px;
    }
  }
}
</style>
