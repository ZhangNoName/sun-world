import { useId } from 'react'
import { Checkbox } from '../../components/checkbox'
import { Input, type InputProps } from '../../components/input'
import { Label } from '../../components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../components/select'
import { cn } from '../../lib/cn'

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

export function NativeSelectField({
  label,
  options,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string
  options: Array<{ value: string; label: string }>
}) {
  const id = useId()
  return (
    <div className="sun-ui-field">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={cn(
          'border-input bg-background ring-offset-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50',
          className
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
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
  const id = useId()
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
