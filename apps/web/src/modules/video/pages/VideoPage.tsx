import { useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type Artplayer from 'artplayer'
import type { Option } from 'artplayer'
import Hls from 'hls.js'
import artplayerPluginDanmuku from 'artplayer-plugin-danmuku'
import artplayerPluginDocumentPip from 'artplayer-plugin-document-pip'
import artplayerPluginHlsControl from 'artplayer-plugin-hls-control'
import { toast } from '@sun-world/ui/toast'
import { Button } from '@sun-world/ui/button'
import { VideoPlayer } from '../ui/VideoPlayer'
import './video.css'

const fallbackUrl =
  'https://sunworld.site/static/videos/3064f698-8e37-4792-b4bd-cbc365ca8ab9/master.m3u8'
type ArtplayerWithHls = Artplayer & { hls?: Hls }
function safeVideoUrl(value: string | null) {
  if (!value) return fallbackUrl
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.href
      : fallbackUrl
  } catch {
    return fallbackUrl
  }
}

export function VideoPage() {
  const [params] = useSearchParams()
  const url = safeVideoUrl(params.get('url'))
  const option = useMemo<Partial<Option>>(
    () => ({
      url,
      type: 'm3u8',
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
      airplay: true,
      theme: '#ff6b6b',
      volume: 0.7,
      autoplay: false,
      fullscreen: true,
      fullscreenWeb: true,
      miniProgressBar: true,
      plugins: [
        artplayerPluginDocumentPip({}),
        artplayerPluginDanmuku({
          danmuku: 'https://artplayer.org/assets/sample/danmuku.xml',
        }),
        artplayerPluginHlsControl({
          quality: {
            control: true,
            setting: true,
            getName: (level: { height: number }) => `${level.height}P`,
            title: 'Quality',
            auto: 'Auto',
          },
          audio: {
            control: true,
            setting: true,
            getName: (track: { name: string }) => track.name,
            title: 'Audio',
            auto: 'Auto',
          },
        }),
      ],
      contextmenu: [
        {
          html: '复制视频地址',
          click: () => {
            void navigator.clipboard?.writeText(url)
            toast.success('视频地址已复制')
          },
        },
      ],
      customType: {
        m3u8: (video, source, art) => {
          const player = art as ArtplayerWithHls
          if (Hls.isSupported()) {
            player.hls?.destroy()
            const hls = new Hls()
            hls.loadSource(source)
            hls.attachMedia(video)
            player.hls = hls
            player.on('destroy', () => hls.destroy())
          } else if (video.canPlayType('application/vnd.apple.mpegurl'))
            video.src = source
          else player.notice.show = '当前浏览器不支持 HLS 播放'
        },
      },
    }),
    [url]
  )
  return (
    <main className="video-page">
      <section className="video-stage">
        <VideoPlayer option={option} />
      </section>
      <aside className="video-aside">
        <h1>视频播放</h1>
        <p className="video-url" title={url}>
          {url}
        </p>
        <Button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(url)
            toast.success('视频地址已复制')
          }}
        >
          复制地址
        </Button>
      </aside>
    </main>
  )
}
export default VideoPage
