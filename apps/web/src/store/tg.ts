import { create } from 'zustand'

import {
  getServerViewportWidth,
  getViewportWidth,
} from '@/shared/browser/viewport'

export const DEVICE_TYPE = {
  MOBILE: 'mobile',
  WEB: 'web',
  IPAD: 'ipad',
  TMA: 'tma',
} as const

export type DeviceType = (typeof DEVICE_TYPE)[keyof typeof DEVICE_TYPE]

interface DeviceState {
  userAgent: string
  screenWidth: number
  isTelegramMiniApp: boolean
  isIPad: boolean
  isIOS: boolean
  isAppleDevice: boolean
  isMobile: boolean
  isWeb: boolean
  deviceType: DeviceType
  deviceModel: string
  handleResize: () => void
}

function isTelegramMiniApp() {
  return typeof window !== 'undefined' && Boolean(window.Telegram?.WebApp)
}

function calculateDevice(userAgent: string, screenWidth: number) {
  const tma = isTelegramMiniApp()
  const touchMac =
    /Macintosh/i.test(userAgent) &&
    typeof document !== 'undefined' &&
    'ontouchend' in document
  const ipad = !tma && (/iPad/i.test(userAgent) || touchMac)
  const mobile =
    !ipad &&
    (/Android|webOS|BlackBerry|IEMobile|Opera Mini|iPhone|iPod/i.test(
      userAgent
    ) ||
      screenWidth <= 768)
  const deviceType: DeviceType = tma
    ? DEVICE_TYPE.TMA
    : ipad
      ? DEVICE_TYPE.IPAD
      : mobile
        ? DEVICE_TYPE.MOBILE
        : DEVICE_TYPE.WEB

  return {
    isTelegramMiniApp: tma,
    isIPad: ipad,
    isIOS: !tma && (/iPad|iPhone|iPod/i.test(userAgent) || ipad),
    isAppleDevice: /Macintosh|Mac OS X|iPad|iPhone|iPod/i.test(userAgent),
    isMobile: mobile,
    isWeb: deviceType === DEVICE_TYPE.WEB,
    deviceType,
    deviceModel:
      deviceType === DEVICE_TYPE.TMA ? 'Telegram Mini App' : deviceType,
  }
}

const initialUserAgent =
  typeof navigator === 'undefined' ? '' : navigator.userAgent
const initialScreenWidth =
  typeof window === 'undefined' ? getServerViewportWidth() : getViewportWidth()

export const useDeviceStore = create<DeviceState>((set) => ({
  userAgent: initialUserAgent,
  screenWidth: initialScreenWidth,
  ...calculateDevice(initialUserAgent, initialScreenWidth),
  handleResize() {
    const userAgent =
      typeof navigator === 'undefined' ? '' : navigator.userAgent
    const screenWidth = getViewportWidth()
    set({ userAgent, screenWidth, ...calculateDevice(userAgent, screenWidth) })
  },
}))

export function installDeviceListener() {
  if (typeof window === 'undefined') return () => undefined
  const handleResize = () => useDeviceStore.getState().handleResize()
  handleResize()
  window.addEventListener('resize', handleResize)

  const telegram = window.Telegram?.WebApp
  telegram?.ready()
  telegram?.expand()

  return () => window.removeEventListener('resize', handleResize)
}
