export function formatDate(value: string, format = 'yyyy-MM-DD HH:mm') {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  const values: Record<string, string> = {
    yyyy: String(date.getFullYear()),
    YYYY: String(date.getFullYear()),
    MM: String(date.getMonth() + 1).padStart(2, '0'),
    DD: String(date.getDate()).padStart(2, '0'),
    HH: String(date.getHours()).padStart(2, '0'),
    mm: String(date.getMinutes()).padStart(2, '0'),
    ss: String(date.getSeconds()).padStart(2, '0'),
  }
  return format.replace(
    /yyyy|YYYY|MM|DD|HH|mm|ss/g,
    (token) => values[token] ?? token
  )
}

export interface ExportTile {
  left: number
  top: number
  image: string
}

export async function saveTilesAsZip(
  tiles: ExportTile[][],
  zipFileName = 'tiles.zip',
  tileSize?: { width: number; height: number }
) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (let row = 0; row < tiles.length; row += 1) {
    for (let column = 0; column < tiles[row].length; column += 1) {
      const tile = tiles[row][column]
      if (!tile.image) continue
      const blob = tileSize
        ? await cropImage(
            tile.image,
            tile.left,
            tile.top,
            tileSize.width,
            tileSize.height
          )
        : dataUriToBlob(tile.image)
      zip.file(`${row + 1}_${column + 1}.png`, blob)
    }
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  downloadBlob(blob, zipFileName)
}

export function saveTileImages(tiles: ExportTile[][]) {
  tiles.flat().forEach((tile, index) => {
    if (tile.image) downloadBlob(dataUriToBlob(tile.image), `${index + 1}.png`)
  })
}

export function downloadUrl(url: string, fileName: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
}

export function saveTilesJson(value: unknown, fileName = 'tiles.json') {
  downloadBlob(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
    fileName
  )
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  downloadUrl(url, fileName)
  URL.revokeObjectURL(url)
}

async function cropImage(
  url: string,
  left: number,
  top: number,
  width: number,
  height: number
) {
  const image = await loadImage(url)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas 2D context is unavailable')
  context.drawImage(image, left, top, width, height, 0, 0, width, height)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('Tile image export failed')),
      'image/png'
    )
  )
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Image could not be loaded'))
    image.src = url
  })
}

function dataUriToBlob(dataUri: string) {
  const match = dataUri.match(/^data:([^;,]+)(;base64)?,(.*)$/)
  if (!match) throw new Error('Invalid data URI format')
  const raw = match[2] ? atob(match[3]) : decodeURIComponent(match[3])
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0))
  return new Blob([bytes], { type: match[1] })
}
