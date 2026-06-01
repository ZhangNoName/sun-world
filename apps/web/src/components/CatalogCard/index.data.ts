import { CatalogItemType } from '@/type'

export const CatalogListData: CatalogItemType[] = [
  {
    id: '1',
    level: '1',
    name: '1',
    children: [
      {
        id: '1-1',
        name: '1-1',
        level: '2',
        children: [
          {
            id: '1-1-1',
            name: '1-1-1',
            level: '3',
          },
        ],
      },
      {
        id: '1-2',
        name: '1-2',
        level: '2',
      },
    ],
  },
  {
    id: '2',
    name: '2',
    level: '1',
  },
  {
    id: '3',
    name: '3',
    level: '1',
    children: [
      {
        id: '3-1',
        name: '3-1',
        level: '2',
      },
      {
        id: '3-2',
        name: '3-2',
        level: '2',
      },
    ],
  },
]
