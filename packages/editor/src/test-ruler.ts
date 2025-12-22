/**
 * 标尺测试文件
 * 用于验证标尺是否正确显示
 */

import { SWEditor } from './editor'

// 创建测试用的容器
const container = document.createElement('div')
container.style.width = '800px'
container.style.height = '600px'
container.style.border = '1px solid #ccc'
document.body.appendChild(container)

// 创建编辑器实例
const editor = new SWEditor({
  containerElement: container,
})

// 验证标尺是否存在
console.log('标尺对象:', editor['rule'])
console.log('标尺是否可见:', editor['rule']?.visible)

// 强制重新渲染
setTimeout(() => {
  editor['renderer'].render()
  console.log('强制重新渲染完成')
}, 1000)

// 测试viewport变化时标尺是否更新
setTimeout(() => {
  console.log('测试viewport变化...')
  editor['viewportState'].move(50, 50)
}, 2000)

export { editor }
