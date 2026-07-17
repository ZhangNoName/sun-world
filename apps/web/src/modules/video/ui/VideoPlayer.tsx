import { useEffect, useRef } from 'react'
import Artplayer, { type Option } from 'artplayer'

export interface VideoPlayerInstance {
  destroy(removeHtml?: boolean): void
}
export type VideoPlayerFactory = (
  option: Partial<Option> & { container: HTMLDivElement; url: string }
) => VideoPlayerInstance
const defaultFactory: VideoPlayerFactory = (option) =>
  new Artplayer(option as Option)

export function VideoPlayer({
  option,
  createPlayer = defaultFactory,
  onReady,
}: {
  option: Partial<Option>
  createPlayer?: VideoPlayerFactory
  onReady?: (player: VideoPlayerInstance) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current || !option.url) return
    const player = createPlayer({
      ...option,
      url: option.url,
      container: host.current,
      lang: 'zh-cn',
    })
    onReady?.(player)
    return () => player.destroy(false)
  }, [createPlayer, onReady, option])
  return (
    <div className="video-player">
      <div className="video-player__host" ref={host} />
    </div>
  )
}
export default VideoPlayer
