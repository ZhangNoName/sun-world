import type { IconDefinition } from './types'

export const uiIcons = {
  search: {
    name: 'search',
    viewBox: '0 0 24 24',
    nodes: [
      ['circle', { cx: 11, cy: 11, r: 8 }],
      ['path', { d: 'm21 21-4.3-4.3' }],
    ],
  },
  plus: {
    name: 'plus',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'M12 5v14' }],
    ],
  },
  send: {
    name: 'send',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'm22 2-7 20-4-9-9-4Z' }],
      ['path', { d: 'M22 2 11 13' }],
    ],
  },
  mic: {
    name: 'mic',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z' }],
      ['path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }],
      ['line', { x1: 12, x2: 12, y1: 19, y2: 22 }],
    ],
  },
  settings: {
    name: 'settings',
    viewBox: '0 0 24 24',
    nodes: [
      [
        'path',
        {
          d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.09a2 2 0 0 1-1-1.74v-.51a2 2 0 0 1 1-1.72l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z',
        },
      ],
      ['circle', { cx: 12, cy: 12, r: 3 }],
    ],
  },
  'panel-left': {
    name: 'panel-left',
    viewBox: '0 0 24 24',
    nodes: [
      ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
      ['path', { d: 'M9 3v18' }],
    ],
  },
  'panel-left-open': {
    name: 'panel-left-open',
    viewBox: '0 0 24 24',
    nodes: [
      ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
      ['path', { d: 'M9 3v18' }],
      ['path', { d: 'm14 9 3 3-3 3' }],
    ],
  },
  'message-circle': {
    name: 'message-circle',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'M7.9 20A9 9 0 1 0 4 16.1L2 22Z' }]],
  },
  trash: {
    name: 'trash',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M3 6h18' }],
      ['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }],
      ['path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }],
    ],
  },
  edit: {
    name: 'edit',
    viewBox: '0 0 24 24',
    nodes: [
      [
        'path',
        { d: 'M12 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' },
      ],
      ['path', { d: 'M18.4 2.6a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z' }],
    ],
  },
  'more-horizontal': {
    name: 'more-horizontal',
    viewBox: '0 0 24 24',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 1 }],
      ['circle', { cx: 19, cy: 12, r: 1 }],
      ['circle', { cx: 5, cy: 12, r: 1 }],
    ],
  },
  'chevron-down': {
    name: 'chevron-down',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'm6 9 6 6 6-6' }]],
  },
  'chevron-left': {
    name: 'chevron-left',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'm15 18-6-6 6-6' }]],
  },
  'chevron-right': {
    name: 'chevron-right',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'm9 18 6-6-6-6' }]],
  },
  x: {
    name: 'x',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M18 6 6 18' }],
      ['path', { d: 'm6 6 12 12' }],
    ],
  },
  check: {
    name: 'check',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'M20 6 9 17l-5-5' }]],
  },
  menu: {
    name: 'menu',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M4 12h16' }],
      ['path', { d: 'M4 6h16' }],
      ['path', { d: 'M4 18h16' }],
    ],
  },
  home: {
    name: 'home',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z' }],
      ['polyline', { points: '9 22 9 12 15 12 15 22' }],
    ],
  },
  canvas: {
    name: 'canvas',
    viewBox: '0 0 24 24',
    nodes: [
      ['rect', { width: 18, height: 14, x: 3, y: 4, rx: 2 }],
      ['path', { d: 'M8 20h8' }],
      ['path', { d: 'M12 18v2' }],
    ],
  },
  calendar: {
    name: 'calendar',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M8 2v4' }],
      ['path', { d: 'M16 2v4' }],
      ['rect', { width: 18, height: 18, x: 3, y: 4, rx: 2 }],
      ['path', { d: 'M3 10h18' }],
    ],
  },
  tag: {
    name: 'tag',
    viewBox: '0 0 24 24',
    nodes: [
      [
        'path',
        {
          d: 'M12.6 2H4a2 2 0 0 0-2 2v8.6a2 2 0 0 0 .6 1.4l7.4 7.4a2 2 0 0 0 2.8 0l8.6-8.6a2 2 0 0 0 0-2.8L14 2.6A2 2 0 0 0 12.6 2Z',
        },
      ],
      ['circle', { cx: 7.5, cy: 7.5, r: 0.5 }],
    ],
  },
  'file-text': {
    name: 'file-text',
    viewBox: '0 0 24 24',
    nodes: [
      [
        'path',
        { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
      ],
      ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
      ['path', { d: 'M10 9H8' }],
      ['path', { d: 'M16 13H8' }],
      ['path', { d: 'M16 17H8' }],
    ],
  },
  list: {
    name: 'list',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M8 6h13' }],
      ['path', { d: 'M8 12h13' }],
      ['path', { d: 'M8 18h13' }],
      ['path', { d: 'M3 6h.01' }],
      ['path', { d: 'M3 12h.01' }],
      ['path', { d: 'M3 18h.01' }],
    ],
  },
  columns: {
    name: 'columns',
    viewBox: '0 0 24 24',
    nodes: [
      ['rect', { width: 7, height: 18, x: 3, y: 3, rx: 1 }],
      ['rect', { width: 7, height: 18, x: 14, y: 3, rx: 1 }],
    ],
  },
  upload: {
    name: 'upload',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
      ['polyline', { points: '17 8 12 3 7 8' }],
      ['path', { d: 'M12 3v12' }],
    ],
  },
  star: {
    name: 'star',
    viewBox: '0 0 24 24',
    nodes: [
      [
        'path',
        {
          d: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21 7 14.2 2 9.3l6.9-1Z',
        },
      ],
    ],
  },
  draft: {
    name: 'draft',
    viewBox: '0 0 24 24',
    nodes: [
      [
        'path',
        { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' },
      ],
      ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }],
      ['path', { d: 'M10 13h4' }],
      ['path', { d: 'M10 17h2' }],
    ],
  },
  'panel-bottom': {
    name: 'panel-bottom',
    viewBox: '0 0 24 24',
    nodes: [
      ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
      ['path', { d: 'M3 15h18' }],
    ],
  },
  square: {
    name: 'square',
    viewBox: '0 0 24 24',
    nodes: [['rect', { width: 16, height: 16, x: 4, y: 4, rx: 2 }]],
  },
  circle: {
    name: 'circle',
    viewBox: '0 0 24 24',
    nodes: [['circle', { cx: 12, cy: 12, r: 8 }]],
  },
  type: {
    name: 'type',
    viewBox: '0 0 24 24',
    nodes: [
      ['polyline', { points: '4 7 4 4 20 4 20 7' }],
      ['line', { x1: 9, x2: 15, y1: 20, y2: 20 }],
      ['line', { x1: 12, x2: 12, y1: 4, y2: 20 }],
    ],
  },
  minus: {
    name: 'minus',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'M5 12h14' }]],
  },
  arrow: {
    name: 'arrow',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M5 12h14' }],
      ['path', { d: 'm13 6 6 6-6 6' }],
    ],
  },
  triangle: {
    name: 'triangle',
    viewBox: '0 0 24 24',
    nodes: [
      [
        'path',
        {
          d: 'M13.7 4.3 21 17a2 2 0 0 1-1.7 3H4.7A2 2 0 0 1 3 17L10.3 4.3a2 2 0 0 1 3.4 0Z',
        },
      ],
    ],
  },
  diamond: {
    name: 'diamond',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'M12 2 22 12 12 22 2 12Z' }]],
  },
  pentagon: {
    name: 'pentagon',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'M12 2 21 8.5 17.5 22h-11L3 8.5Z' }]],
  },
  image: {
    name: 'image',
    viewBox: '0 0 24 24',
    nodes: [
      ['rect', { width: 18, height: 18, x: 3, y: 3, rx: 2 }],
      ['circle', { cx: 9, cy: 9, r: 2 }],
      ['path', { d: 'm21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21' }],
    ],
  },
  frame: {
    name: 'frame',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M5 3h14' }],
      ['path', { d: 'M5 21h14' }],
      ['path', { d: 'M3 5v14' }],
      ['path', { d: 'M21 5v14' }],
      ['rect', { width: 12, height: 12, x: 6, y: 6, rx: 1 }],
    ],
  },
  group: {
    name: 'group',
    viewBox: '0 0 24 24',
    nodes: [
      ['rect', { width: 7, height: 7, x: 3, y: 3, rx: 1 }],
      ['rect', { width: 7, height: 7, x: 14, y: 3, rx: 1 }],
      ['rect', { width: 7, height: 7, x: 14, y: 14, rx: 1 }],
      ['rect', { width: 7, height: 7, x: 3, y: 14, rx: 1 }],
    ],
  },
  loader: {
    name: 'loader',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M12 2v4' }],
      ['path', { d: 'm16.2 7.8 2.9-2.9' }],
      ['path', { d: 'M18 12h4' }],
      ['path', { d: 'm16.2 16.2 2.9 2.9' }],
      ['path', { d: 'M12 18v4' }],
      ['path', { d: 'm4.9 19.1 2.9-2.9' }],
      ['path', { d: 'M2 12h4' }],
      ['path', { d: 'm4.9 4.9 2.9 2.9' }],
    ],
  },
  sun: {
    name: 'sun',
    viewBox: '0 0 24 24',
    nodes: [
      ['circle', { cx: 12, cy: 12, r: 4 }],
      ['path', { d: 'M12 2v2' }],
      ['path', { d: 'M12 20v2' }],
      ['path', { d: 'm4.93 4.93 1.41 1.41' }],
      ['path', { d: 'm17.66 17.66 1.41 1.41' }],
      ['path', { d: 'M2 12h2' }],
      ['path', { d: 'M20 12h2' }],
      ['path', { d: 'm6.34 17.66-1.41 1.41' }],
      ['path', { d: 'm19.07 4.93-1.41 1.41' }],
    ],
  },
  moon: {
    name: 'moon',
    viewBox: '0 0 24 24',
    nodes: [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
  },
  user: {
    name: 'user',
    viewBox: '0 0 24 24',
    nodes: [
      ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
      ['circle', { cx: 12, cy: 7, r: 4 }],
    ],
  },
} as const satisfies Record<string, IconDefinition>

export type UiIconName = keyof typeof uiIcons

export const uiIconNames = Object.keys(uiIcons) as UiIconName[]

export function getUiIcon(name: UiIconName): IconDefinition {
  return uiIcons[name]
}
