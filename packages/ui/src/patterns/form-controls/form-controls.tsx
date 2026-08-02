import * as React from 'react'
import { forwardRef } from 'react'

import { Checkbox } from '@sun-world/base-ui/checkbox'
import { Input } from '@sun-world/base-ui/input'
import { Label } from '@sun-world/base-ui/label'
import {
  SwNativeSelect,
  SwSelect,
  type SwNativeSelectProps,
  type SwSelectProps,
} from '../../components/sw-select/sw-select'
import { SwInput, type SwInputProps } from '../../components/sw-input/sw-input'
import { cn } from '../../lib/cn'

/** @deprecated Use SwInput from @sun-world/ui/sw-input. */
export const LabeledInput = forwardRef<
  HTMLInputElement,
  SwInputProps & { label: string }
>(function LabeledInput(props, ref) {
  return <SwInput ref={ref} {...props} />
})

/** @deprecated Use SwSelect from @sun-world/ui/sw-select. */
export function SelectField(props: SwSelectProps & { label: string }) {
  return <SwSelect {...props} />
}

/** @deprecated Use SwNativeSelect from @sun-world/ui/sw-select. */
export function NativeSelectField(
  props: SwNativeSelectProps & { label: string }
) {
  return <SwNativeSelect {...props} />
}

export function CheckboxField({
  label,
  ...props
}: React.ComponentProps<typeof Checkbox> & { label: string }) {
  const id = React.useId()
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} {...props} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}

export function FilePicker({
  label,
  className,
  onFileChange,
  ...props
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'onChange'> & {
  label: string
  onFileChange: (file?: File) => void
}) {
  const id = React.useId()
  return (
    <div className={cn('sun-ui-field', className)}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="file"
        onChange={(event) => onFileChange(event.target.files?.[0])}
        {...props}
      />
    </div>
  )
}

export function FilePickerLabel(
  props: React.LabelHTMLAttributes<HTMLLabelElement>
) {
  return <Label {...props} />
}

export function FilePickerInput(
  props: React.InputHTMLAttributes<HTMLInputElement>
) {
  return <Input type="file" {...props} />
}
