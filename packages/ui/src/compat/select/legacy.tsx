import {
  SwSelect,
  type SwOption,
  type SwSelectProps,
} from '../../components/sw-select/sw-select'

/** @deprecated Use SwOption from @sun-world/ui/sw-select. */
export type SunSelectOption = SwOption

/** @deprecated Use SwSelect from @sun-world/ui/sw-select. */
export type SunSelectProps = SwSelectProps

/** @deprecated Use SwSelect from @sun-world/ui/sw-select. */
export function SunSelect(props: SunSelectProps) {
  return <SwSelect {...props} />
}
