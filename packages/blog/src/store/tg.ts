import { i } from 'node_modules/vite/dist/node/types.d-aGj9QkWt'
import { defineStore } from 'pinia'
import { ref, computed, onMounted, onUnmounted } from 'vue'

// 定义设备类型的枚举或常量
const DEVICE_TYPE = {
  MOBILE: 'mobile', // 广义手机/小型移动设备
  WEB: 'web', // 通用桌面/PC
  IPAD: 'ipad', // iPad/平板设备
  TMA: 'tma', // Telegram Mini App
}

// ----------------------------------------------------
// 辅助函数
// ----------------------------------------------------

// 检查是否为 TMA (Telegram Mini App)
function checkIsTMA() {
  if (typeof window === 'undefined') return false
  return (
    typeof window.Telegram !== 'undefined' &&
    typeof window.Telegram.WebApp !== 'undefined'
  )
}

// 尝试猜测设备型号
function guessDeviceModel(ua: string, type: string): string {
  ua = ua.toLowerCase()

  if (type === DEVICE_TYPE.TMA) {
    return 'Telegram Mini App'
  }
  if (type === DEVICE_TYPE.IPAD) {
    return /ipad/i.test(ua) ? 'iPad' : 'iPadOS (Simulated Mac)'
  }
  if (type === DEVICE_TYPE.MOBILE) {
    if (/iphone|ipod/i.test(ua)) return 'iPhone/iPod'
    if (/android/i.test(ua)) {
      const match = ua.match(/android.*?; (.*?)( build|;|\))/)
      return match && match[1] ? match[1].trim() : 'Android Phone'
    }
    return 'Generic Mobile Device'
  }

  // 桌面端 (WEB)
  if (/win(dows)?/i.test(ua)) return 'Windows PC'
  if (/macintosh|mac os x/i.test(ua)) return 'macOS'
  if (/linux/i.test(ua)) return 'Linux PC'

  return 'Unknown Desktop'
}

// Pinia Store 定义
export const useDeviceStore = defineStore('device', () => {
  // --- 状态 (State) ---
  const initialUserAgent =
    typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const initialScreenWidth =
    typeof window !== 'undefined' ? window.innerWidth : 0

  const userAgent = ref(initialUserAgent)
  const screenWidth = ref(initialScreenWidth)
  const isTMA = ref(checkIsTMA())

  // --- Getter / Computed ---

  // 1. 判断是否为 iPad (保持不变)
  const isIPad = computed(() => {
    // ... (判断逻辑保持不变) ...
    const isIOSPad = /iPad/i.test(userAgent.value)
    const isMacSimulatedTouch =
      /Macintosh/i.test(userAgent.value) &&
      typeof document !== 'undefined' &&
      'ontouchend' in document
    return !isTMA.value && (isIOSPad || isMacSimulatedTouch)
  })

  // 2. 判断是否为 iOS/iPadOS 系统 (iPhone/iPad)
  const isIOS = computed(() => {
    const ua = userAgent.value
    // 检查是否包含 iOS/iPadOS 特有的关键词，同时排除 TMA (它可能运行在 iOS 设备上)
    return !isTMA.value && (/iPad|iPhone|iPod/i.test(ua) || isIPad.value)
  })

  // 3. 判断是否为广义的苹果设备 (iOS/iPadOS/macOS)
  const isAppleDevice = computed(() => {
    const ua = userAgent.value
    // 检查是否包含 Macintosh (macOS) 或 iOS/iPadOS 的关键词
    return /Macintosh|Mac OS X|iPad|iPhone|iPod/i.test(ua)
  })

  // 4. 广义判断是否为手机 (排除 TMA 和 iPad) (保持不变)
  const isMobilePhone = computed(() => {
    return (
      !isTMA.value &&
      !isIPad.value &&
      // 简化判断：如果不是 iPad 且是 iOS，那就是手机
      ((isIOS.value && !isIPad.value) ||
        // 或其他 Android/移动设备判断
        /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent.value) ||
        screenWidth.value <= 768)
    )
  })

  // 5. 最终设备类型 (保持不变)
  const deviceType = computed(() => {
    if (isTMA.value) return DEVICE_TYPE.TMA
    if (isIPad.value) return DEVICE_TYPE.IPAD
    if (isMobilePhone.value) return DEVICE_TYPE.MOBILE
    return DEVICE_TYPE.WEB
  })

  // 6. 设备型号 (依赖 deviceType) (保持不变)
  const deviceModel = computed(() => {
    return guessDeviceModel(userAgent.value, deviceType.value)
  })

  // --- 动作 (Actions) & 返回 (Return) ---

  const handleResize = () => {
    /* ... (保持不变) ... */
  }
  const registerResizeListener = (
    mounted: typeof onMounted,
    unmounted: typeof onUnmounted
  ) => {
    /* ... (保持不变) ... */
  }
  onMounted(() => {
    console.log('Device Store Mounted', isTMA.value, window.Telegram)
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()

      if (isMobilePhone) {
        tg.requestFullscreen()
      }
    }
  })

  return {
    // 状态 & Getter
    deviceType,
    deviceModel,
    isMobile: isMobilePhone,
    isWeb: computed(() => deviceType.value === DEVICE_TYPE.WEB),
    isIPad,
    isIOS, // 新增：判断是否是 iOS/iPadOS
    isAppleDevice, // 新增：判断是否是广义的苹果设备
    isTelegramMiniApp: isTMA,
    DEVICE_TYPE,

    // Actions
    registerResizeListener,
  }
})
