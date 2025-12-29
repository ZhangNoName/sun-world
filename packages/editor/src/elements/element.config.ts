export enum ElementType {
  Rect = 'rect',
  Text = 'text',
  Line = 'line',
  Arrow = 'arrow',
  Ellipse = 'ellipse',
  Polygon = 'polygon',
  Star = 'star',
  Diamond = 'diamond',
  Triangle = 'triangle',
  Rectangle = 'rectangle',
  Circle = 'circle',
}

export enum FillType {
  Solid = 'solid',
  Image = 'image',
  Gradient = 'gradient',
}

// 预设色彩集合
export const PRESET_COLORS = [
  '#FF6B6B', // 红色
  '#4ECDC4', // 青色
  '#45B7D1', // 蓝色
  '#FFA07A', // 浅橙
  '#98D8C8', // 薄荷绿
  '#F7DC6F', // 黄色
  '#BB8FCE', // 紫色
  '#85C1E2', // 天蓝
  '#F8B739', // 橙色
  '#52BE80', // 绿色
  '#EC7063', // 粉红
  '#5DADE2', // 亮蓝
  '#F39C12', // 深橙
  '#58D68D', // 浅绿
  '#AF7AC5', // 淡紫
]

// 随机获取预设颜色
export function getRandomColor(): string {
  return PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]
}

export interface FillStyle {
  type: FillType
  color?: string // 纯色填充
  imageUrl?: string // 图片填充
  image?: HTMLImageElement // 已加载的图片对象
}

export const elementConfig = {
  name: {
    fontSize: 12,
    fontFamily: 'Arial',
    textAlign: 'left' as CanvasTextAlign,
    color: '#000000',
    backgroundColor: '#ffffff',
    backgroundOpacity: 0.8,
    padding: 4,
    borderRadius: 4,
    offsetX: 0,
    offsetY: -15,
    showBackground: true,
    strokeColor: '#ffffff',
    strokeWidth: 2,
  },
  border: {},
}
