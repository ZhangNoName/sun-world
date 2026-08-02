import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import { Button } from '@sun-world/base-ui/button'
import { SchemaForm } from './SchemaForm'

describe('SchemaForm', () => {
  it('renders registered fields and reports controlled submit values', () => {
    const onSubmit = vi.fn()
    render(
      <SchemaForm
        fields={[
          { name: 'name', label: 'Name', type: 'input', required: true },
          {
            name: 'kind',
            label: 'Kind',
            type: 'select',
            options: [{ value: 'a', label: 'A' }],
          },
          {
            name: 'custom',
            label: 'Custom',
            type: 'custom',
            render: ({ value, onChange }) => (
              <Button type="button" onClick={() => onChange('ready')}>
                {String(value || 'Set custom')}
              </Button>
            ),
          },
        ]}
        values={{ name: '', kind: 'a', custom: '' }}
        onChange={vi.fn()}
        onSubmit={onSubmit}
      />
    )

    fireEvent.submit(screen.getByRole('form'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Name 为必填项')
  })
})
