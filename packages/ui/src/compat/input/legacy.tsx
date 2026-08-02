import { SwInput, type SwInputProps } from '../../components/sw-input/sw-input'

/** @deprecated Use SwInput from @sun-world/ui/sw-input. */
export interface SunInputProps extends SwInputProps {
  inputSize?: 'sm' | 'md' | 'lg'
  clearable?: boolean
}

/** @deprecated Use SwInput from @sun-world/ui/sw-input. */
export function SunInput(props: SunInputProps) {
  return <SwInput {...props} />
}
