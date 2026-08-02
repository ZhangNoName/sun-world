import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'

import { SwButton as Button } from '@sun-world/ui/sw-button'
import { Checkbox } from '@sun-world/base-ui/checkbox'
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@sun-world/base-ui/field'
import { SwInput } from '@sun-world/ui/sw-input'
import { SwSelect } from '@sun-world/ui/sw-select'
import { Textarea } from '@sun-world/base-ui/textarea'

import { fetchDictionary } from '../data/dictionaryRepository'
import { useManageCopy } from '../manageCopy'
import type { SchemaField } from './ManageTypes'

export interface SchemaFormProps<TValues extends Record<string, unknown>> {
  fields: Array<SchemaField<TValues>>
  values: TValues
  onChange: (name: keyof TValues & string, value: unknown) => void
  onSubmit: (values: TValues) => Promise<void> | void
  errors?: Partial<Record<keyof TValues & string, string>>
  submitting?: boolean
  submitLabel?: string
  actions?: ReactNode
}

export function SchemaForm<TValues extends Record<string, unknown>>({
  fields,
  values,
  onChange,
  onSubmit,
  errors = {},
  submitting = false,
  submitLabel,
  actions,
}: SchemaFormProps<TValues>) {
  const copy = useManageCopy()
  const resolvedSubmitLabel = submitLabel ?? copy.form.save
  const [localErrors, setLocalErrors] = useState<Record<string, string>>({})
  const [dictionaryOptions, setDictionaryOptions] = useState<
    Record<string, Array<{ value: string; label: string }>>
  >({})
  const [dictionaryErrors, setDictionaryErrors] = useState<
    Record<string, string>
  >({})
  const dictionaryCodes = useMemo(
    () =>
      fields
        .filter((field) => field.type === 'dict' && field.dictCode)
        .map((field) => field.dictCode!)
        .filter((code, index, all) => all.indexOf(code) === index),
    [fields]
  )

  useEffect(() => {
    let active = true
    void Promise.all(
      dictionaryCodes.map(async (code) => {
        try {
          const options = await fetchDictionary(code)
          if (active) {
            setDictionaryOptions((current) => ({
              ...current,
              [code]: options.map(({ value, label }) => ({ value, label })),
            }))
          }
        } catch {
          if (active) {
            setDictionaryErrors((current) => ({
              ...current,
              [code]: copy.form.dictionaryError,
            }))
          }
        }
      })
    )
    return () => {
      active = false
    }
  }, [copy.form.dictionaryError, dictionaryCodes])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const nextErrors: Record<string, string> = {}
    fields.forEach((field) => {
      const value = values[field.name]
      if (
        field.required &&
        (value === undefined || value === null || String(value).trim() === '')
      ) {
        nextErrors[field.name] = copy.form.required(field.label)
      }
    })
    setLocalErrors(nextErrors)
    if (Object.keys(nextErrors).length || submitting) return
    await onSubmit(values)
  }

  return (
    <form
      className="manage-schema-form"
      aria-label={copy.form.ariaLabel}
      onSubmit={handleSubmit}
    >
      <div className="manage-schema-form__fields">
        {fields.map((field) => {
          const name = field.name
          const value = values[name]
          const error = errors[name] ?? localErrors[name]
          const setValue = (nextValue: unknown) => {
            setLocalErrors((current) => {
              if (!current[name]) return current
              const next = { ...current }
              delete next[name]
              return next
            })
            onChange(name, nextValue)
          }

          if (field.type === 'custom' && field.render) {
            return (
              <Field key={name} data-disabled={field.disabled || undefined}>
                <FieldLabel>{field.label}</FieldLabel>
                {field.render({ value, error, onChange: setValue })}
                {field.description ? (
                  <FieldDescription>{field.description}</FieldDescription>
                ) : null}
                <FieldError>{error}</FieldError>
              </Field>
            )
          }

          if (field.type === 'switch') {
            return (
              <Field
                key={name}
                orientation="horizontal"
                data-disabled={field.disabled || undefined}
              >
                <FieldLabel htmlFor={`schema-${name}`}>
                  {field.label}
                </FieldLabel>
                <Checkbox
                  id={`schema-${name}`}
                  checked={Boolean(value)}
                  disabled={field.disabled}
                  onCheckedChange={setValue}
                  aria-label={field.label}
                />
                <FieldError>{error}</FieldError>
              </Field>
            )
          }

          if (field.type === 'select' || field.type === 'dict') {
            const options =
              field.type === 'dict'
                ? (dictionaryOptions[field.dictCode ?? ''] ?? [])
                : (field.options ?? [])
            const dictionaryError = field.dictCode
              ? dictionaryErrors[field.dictCode]
              : undefined
            return (
              <Field key={name} data-disabled={field.disabled || undefined}>
                <SwSelect
                  label={field.label}
                  value={value == null ? '' : String(value)}
                  options={options}
                  placeholder={field.placeholder ?? copy.form.selectPlaceholder}
                  disabled={field.disabled}
                  onValueChange={setValue}
                  error={error ?? dictionaryError}
                />
                {field.description ? (
                  <FieldDescription>{field.description}</FieldDescription>
                ) : null}
                <FieldError>{error ?? dictionaryError}</FieldError>
              </Field>
            )
          }

          if (field.type === 'textarea') {
            return (
              <Field key={name} data-disabled={field.disabled || undefined}>
                <FieldLabel htmlFor={`schema-${name}`}>
                  {field.label}
                </FieldLabel>
                <Textarea
                  id={`schema-${name}`}
                  value={value == null ? '' : String(value)}
                  placeholder={field.placeholder}
                  disabled={field.disabled}
                  aria-invalid={error ? true : undefined}
                  onChange={(event) => setValue(event.currentTarget.value)}
                />
                {field.description ? (
                  <FieldDescription>{field.description}</FieldDescription>
                ) : null}
                <FieldError>{error}</FieldError>
              </Field>
            )
          }

          return (
            <Field key={name} data-disabled={field.disabled || undefined}>
              <SwInput
                label={field.label}
                type={
                  field.type === 'number'
                    ? 'number'
                    : field.type === 'date'
                      ? 'date'
                      : 'text'
                }
                value={value == null ? '' : String(value)}
                placeholder={field.placeholder}
                disabled={field.disabled}
                onValueChange={setValue}
                error={error}
              />
              {field.description ? (
                <FieldDescription>{field.description}</FieldDescription>
              ) : null}
              <FieldError>{error}</FieldError>
            </Field>
          )
        })}
      </div>
      <div className="manage-schema-form__actions">
        <Button type="submit" loading={submitting} disabled={submitting}>
          {resolvedSubmitLabel}
        </Button>
        {actions}
      </div>
    </form>
  )
}
