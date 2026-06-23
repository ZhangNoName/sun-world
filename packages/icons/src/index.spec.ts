import { describe, expect, it } from 'vitest'

import * as publicExports from './index'

describe('@sun-world/icons public exports', () => {
  it('keeps UI icons on the data renderer path instead of legacy Vue components', () => {
    expect(publicExports).toHaveProperty('uiIconNames')
    expect(publicExports).toHaveProperty('SunIcon')
    expect(publicExports).not.toHaveProperty('Clock')
    expect(publicExports).not.toHaveProperty('AddOutlined')
  })

  it('keeps brand and editor tool icons available from the legacy root path', () => {
    expect(publicExports).toHaveProperty('GithubOutlined')
    expect(publicExports).toHaveProperty('QQOutlined')
    expect(publicExports).toHaveProperty('WeChatOutLined')
    expect(publicExports).toHaveProperty('RectSvg')
    expect(publicExports).toHaveProperty('HandSvg')
    expect(publicExports).toHaveProperty('CommentSvg')
    expect(publicExports).toHaveProperty('SelectSvg')
  })
})
