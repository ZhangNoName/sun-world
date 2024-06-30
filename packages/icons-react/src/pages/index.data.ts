import { FC, ReactNode } from 'react'
import { AddOutlined } from '../icons'
import { ZIconProps } from '../type'

export const initIcon = (fc: FC<ZIconProps>, props: ZIconProps): ReactNode => {
  return fc({
    ...props
  })
}
export const IconsList = [AddOutlined]