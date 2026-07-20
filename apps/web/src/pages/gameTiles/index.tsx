import { CheckboxField, LabeledInput } from '@/shared/ui/form-controls'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@sun-world/ui/button'
import { toast } from '@sun-world/ui/toast'
import { downloadUrl, saveTilesAsZip, saveTilesJson } from '@/util/function'
import './tiles.css'

export interface TileConfig {
  row: number
  col: number
  width: number
  height: number
  gap: number
}
export interface TileItem {
  left: number
  top: number
  image: string
}
export interface TileExportContext {
  imageUrl: string
  tiles: TileItem[][]
  config: TileConfig
}
export interface TileExporters {
  whole: (context: TileExportContext) => void | Promise<void>
  split: (context: TileExportContext) => void | Promise<void>
  json: (context: TileExportContext) => void | Promise<void>
}
const defaultConfig: TileConfig = {
  row: 20,
  col: 20,
  width: 16,
  height: 16,
  gap: 1,
}

export function clampTileConfig(config: TileConfig): TileConfig {
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, Math.trunc(value) || min))
  return {
    row: clamp(config.row, 1, 100),
    col: clamp(config.col, 1, 100),
    width: clamp(config.width, 10, 100),
    height: clamp(config.height, 10, 100),
    gap: clamp(config.gap, 0, 100),
  }
}

export function createTiles(image: string, config: TileConfig): TileItem[][] {
  return Array.from({ length: config.row }, (_, row) =>
    Array.from({ length: config.col }, (_, col) => ({
      left: col * config.width,
      top: row * config.height,
      image,
    }))
  )
}

const defaultExporters: TileExporters = {
  whole: ({ imageUrl }) => downloadUrl(imageUrl, 'tiles-source.png'),
  split: ({ tiles, config }) =>
    saveTilesAsZip(tiles, 'tiles.zip', {
      width: config.width,
      height: config.height,
    }),
  json: ({ config, tiles }) =>
    saveTilesJson({
      version: 1,
      config,
      tiles: tiles.map((row) => row.map(({ left, top }) => ({ left, top }))),
    }),
}

export async function exportTileSelection(
  options: string[],
  context: TileExportContext,
  exporters: TileExporters = defaultExporters
) {
  if (!context.imageUrl) throw new Error('请先选择图片')
  if (options.includes('all')) await exporters.whole(context)
  if (options.includes('split')) await exporters.split(context)
  if (options.includes('json')) await exporters.json(context)
}

export function GameTilesPage() {
  const [config, setConfig] = useState(defaultConfig)
  const [imageUrl, setImageUrl] = useState('')
  const [selected, setSelected] = useState({ row: 0, col: 0 })
  const [exports, setExports] = useState(['split'])
  const objectUrl = useRef('')
  const tiles = useMemo(() => createTiles(imageUrl, config), [config, imageUrl])
  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    },
    []
  )
  const update = (key: keyof TileConfig, value: string) =>
    setConfig((current) =>
      clampTileConfig({ ...current, [key]: Number(value) })
    )
  const chooseFile = (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      toast.error('请选择图片文件')
      return
    }
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = URL.createObjectURL(file)
    setImageUrl(objectUrl.current)
  }
  const toggleExport = (name: string, checked: boolean) =>
    setExports((current) =>
      checked
        ? [...new Set([...current, name])]
        : current.filter((item) => item !== name)
    )
  const runExport = async () => {
    try {
      await exportTileSelection(exports, { imageUrl, tiles, config })
      toast.success('导出任务已完成')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '导出失败')
    }
  }
  const clear = () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current)
    objectUrl.current = ''
    setImageUrl('')
  }
  return (
    <main className="tiles-page">
      <section
        className="tiles-preview"
        style={{ gap: config.gap }}
        aria-label="瓦片预览"
      >
        {tiles.map((row, rowIndex) => (
          <div className="tile-row" style={{ gap: config.gap }} key={rowIndex}>
            {row.map((tile, colIndex) => (
              <button
                type="button"
                className={`tile-item ${selected.row === rowIndex && selected.col === colIndex ? 'is-selected' : ''}`}
                key={colIndex}
                title={`${rowIndex}-${colIndex}`}
                onClick={() => setSelected({ row: rowIndex, col: colIndex })}
                style={{
                  width: config.width,
                  height: config.height,
                  backgroundImage: tile.image
                    ? `url(${tile.image})`
                    : undefined,
                  backgroundPosition: `-${tile.left}px -${tile.top}px`,
                }}
              />
            ))}
          </div>
        ))}
      </section>
      <aside className="tiles-config">
        <header>
          <h1>游戏瓦片切片</h1>
          <p>导入图片，配置网格后导出原图、PNG 切片或 JSON。</p>
        </header>
        <label className="file-picker">
          图片文件
          <input
            aria-label="图片文件"
            type="file"
            accept="image/*"
            onChange={(event) => chooseFile(event.target.files?.[0])}
          />
        </label>
        <div className="config-grid">
          {(['row', 'col', 'width', 'height', 'gap'] as const).map((key) => (
            <LabeledInput
              key={key}
              label={
                {
                  row: '行数',
                  col: '列数',
                  width: '瓦片宽',
                  height: '瓦片高',
                  gap: '间距',
                }[key]
              }
              type="number"
              value={String(config[key])}
              onValueChange={(value) => update(key, value)}
            />
          ))}
        </div>
        <p>
          画布：{config.col * config.width}px × {config.row * config.height}px ·
          当前 {selected.row + 1} 行 {selected.col + 1} 列
        </p>
        <div className="export-options">
          <CheckboxField
            label="整图"
            checked={exports.includes('all')}
            onCheckedChange={(value) => toggleExport('all', value === true)}
          />
          <CheckboxField
            label="PNG 切片 ZIP"
            checked={exports.includes('split')}
            onCheckedChange={(value) => toggleExport('split', value === true)}
          />
          <CheckboxField
            label="瓦片 JSON"
            checked={exports.includes('json')}
            onCheckedChange={(value) => toggleExport('json', value === true)}
          />
        </div>
        <div className="tile-actions">
          <Button onClick={() => void runExport()} disabled={!exports.length}>
            导出
          </Button>
          <Button variant="destructive" onClick={clear}>
            清空
          </Button>
        </div>
      </aside>
    </main>
  )
}
export default GameTilesPage
