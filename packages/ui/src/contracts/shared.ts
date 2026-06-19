export type SunComponentState = 'default' | 'disabled' | 'label'

export interface SunControlStateProps {
  disabled?: boolean
  label?: string
  state?: SunComponentState
  ariaLabel?: string
}

export function isDisabledState(props: Pick<SunControlStateProps, 'disabled' | 'state'>) {
  return props.disabled === true || props.state === 'disabled'
}

export function isLabelState(props: Pick<SunControlStateProps, 'label' | 'state'>) {
  return Boolean(props.label) || props.state === 'label'
}
