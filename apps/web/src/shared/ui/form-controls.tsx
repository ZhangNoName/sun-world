import { useId } from 'react'
import { Checkbox } from '@sun-world/ui/checkbox'
import { Input, type InputProps } from '@sun-world/ui/input'
import { Label } from '@sun-world/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@sun-world/ui/select'

export function LabeledInput({
  label,
  id,
  ...props
}: InputProps & { label: string }) {
  const generatedId = useId()
  const inputId = id ?? generatedId
  return (
    <div className="sun-ui-field">
      <Label htmlFor={inputId}>{label}</Label>
      <Input id={inputId} {...props} />
    </div>
  )
}

export function SelectField({
  label,
  options,
  ...props
}: React.ComponentProps<typeof Select> & {
  label: string
  options: Array<{ value: string; label: string; disabled?: boolean }>
}) {
  const id = useId()
  return (
    <div className="sun-ui-field">
      <Label htmlFor={id}>{label}</Label>
      <Select {...props}>
        <SelectTrigger id={id}>
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

export function CheckboxField({
  label,
  ...props
}: React.ComponentProps<typeof Checkbox> & { label: string }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <Checkbox id={id} {...props} />
      <Label htmlFor={id}>{label}</Label>
    </div>
  )
}
