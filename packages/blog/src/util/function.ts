import moment from 'moment'
import JSZip from 'jszip'
/**
 * 格式化日期字符串
 *
 * @param {string} s - 需要格式化的日期字符串
 * @param {string} format - 目标日期格式，默认为 yyyy-MM-dd
 * @returns {string} 格式化后的日期字符串
 *
 * @example
 * FormatDate('2023-11-25T12:00:00Z', 'YYYY年MM月DD日') // 返回 '2023年11月25日'
 */
export const formatDate = (s: string, format: string = 'yyyy-MM-DD HH:mm') => {
  return moment(s).format(format)
}
// 下载图像并压缩成 ZIP 文件
export const saveTilesAsZip = async (
  tiles: {
    left: number
    top: number
    image: string
  }[][],
  zipFileName: string = 'tiles.zip'
) => {
  const zip = new JSZip() // 创建新的 ZIP 文件
  // 遍历瓦片数据，并获取行和列的索引
  for (let rowIndex = 0; rowIndex < tiles.length; rowIndex++) {
    const row = tiles[rowIndex]

    // 遍历每一行的瓦片
    for (let colIndex = 0; colIndex < row.length; colIndex++) {
      const tile = row[colIndex]

      if (tile.image) {
        const fileName = `${rowIndex + 1}_${colIndex + 1}.png` // 使用瓦片的坐标作为文件名

        try {
          // 将 Base64 编码的图片转换为 Blob
          const blob = dataURItoBlob(tile.image)
          // 将 Blob 数据添加到 ZIP 文件
          zip.file(fileName, blob)
        } catch (error) {
          console.error('Error converting data URI to Blob:', error)
        }
      }
    }
  }

  // 生成 ZIP 文件并下载
  const zipBlob = await zip.generateAsync({ type: 'blob' })

  // 创建一个临时的下载链接并触发下载
  const link = document.createElement('a')
  const url = URL.createObjectURL(zipBlob)
  link.href = url
  link.download = zipFileName // 设置下载文件名
  link.click() // 触发点击事件下载文件

  // 清理 URL 对象
  URL.revokeObjectURL(url)
}

export const saveTileImages = (
  tiles: {
    left: number
    top: number
    image: string
  }[][],
  batchSize: number = 5 // 每批次最多下载多少个文件
) => {
  let index = 0

  const downloadBatch = () => {
    const currentBatch: any[] = []
    for (let i = 0; i < batchSize && index < tiles.length; i++) {
      const row = tiles[index]
      row.forEach((tile, colIndex) => {
        if (tile.image) {
          currentBatch.push({
            fileName: `${index + 1}_${colIndex + 1}.png`,
            image: tile.image,
          })
        }
      })
      index++
    }

    // 执行下载操作
    currentBatch.forEach(({ fileName, image }) => {
      downloadImage(image, fileName)
    })

    // 如果还有更多批次，则延迟下载下一批
    if (index < tiles.length) {
      setTimeout(downloadBatch, 1500) // 延迟500ms再继续下一批次
    }
  }

  // 启动第一次下载
  downloadBatch()
}

// 下载图像到本地（模拟下载）
const downloadImage = (imageData: string, fileName: string) => {
  // 创建一个 Blob 对象
  const blob = dataURItoBlob(imageData)

  // 创建一个链接元素
  const link = document.createElement('a')

  // 使用 URL.createObjectURL 创建一个可以下载的 URL
  const url = URL.createObjectURL(blob)
  link.href = url
  link.download = fileName // 设置下载文件名

  // 触发点击事件，下载文件
  link.click()

  // 清理 URL 对象
  URL.revokeObjectURL(url)
}

const dataURItoBlob = (dataURI: string) => {
  // 确保 dataURI 是有效的，并且包含 Base64 编码的数据
  const base64Pattern = /^data:([A-Za-z-+/]+)(?:;base64)?,(.+)$/
  const match = dataURI.match(base64Pattern)

  if (!match) {
    throw new Error('Invalid data URI format')
  }

  const mimeString = match[1] // MIME 类型
  const byteString = atob(match[2]) // Base64 编码的图像数据

  const arrayBuffer = new ArrayBuffer(byteString.length)
  const uintArray = new Uint8Array(arrayBuffer)

  // 将 Base64 数据转换为二进制
  for (let i = 0; i < byteString.length; i++) {
    uintArray[i] = byteString.charCodeAt(i)
  }

  // 返回一个 Blob 对象
  return new Blob([arrayBuffer], { type: mimeString })
}
