import { describe, expect, it } from 'vitest'

import { adminModule } from './index'

describe('adminModule model management routes', () => {
  it('publishes the canonical model route and keeps provider compatibility', () => {
    const paths = adminModule.routes.map((route) => route.path)

    expect(paths).toContain('/manage/ai/models')
    expect(paths).toContain('/manage/ai/providers')
    expect(
      adminModule.routes.find((route) => route.path === '/manage/ai/models')
        ?.meta
    ).toMatchObject({ title: 'AI 模型管理 - Sun World', noIndex: true })
  })
})
