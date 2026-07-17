import { Link } from 'react-router'
import { SunIcon, type SunIconProps } from '@sun-world/icons/react'
import './tools.css'

const tools: Array<{
  path: string
  title: string
  description: string
  icon: SunIconProps['name']
}> = [
  {
    path: '/game_tiles',
    title: '游戏瓦片切片',
    description: '把精灵图导出为 PNG 切片与布局 JSON。',
    icon: 'columns',
  },
  {
    path: '/canvas',
    title: '画布编辑器',
    description: '绘制、选择并管理画布元素。',
    icon: 'canvas',
  },
  {
    path: '/keep',
    title: 'TCX 生成器',
    description: '生成可导入运动平台的室内跑步记录。',
    icon: 'file-text',
  },
  {
    path: '/video',
    title: 'HLS 播放器',
    description: '播放 HLS 视频并支持自定义视频地址。',
    icon: 'image',
  },
]

export default function ToolsPage() {
  return (
    <main className="tools-page">
      <header>
        <h1>工具箱</h1>
        <p>Sun World 的创作与数据处理工具。</p>
      </header>
      <section className="tool-grid">
        {tools.map((tool) => (
          <Link className="tool-card" to={tool.path} key={tool.path}>
            <SunIcon name={tool.icon} size={28} />
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
          </Link>
        ))}
      </section>
    </main>
  )
}
