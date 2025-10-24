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
      /Android|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent.value) ||
      screenWidth.value <= 768
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

  // --- 动作 (Actions) ---

  // 1. 核心处理函数：更新 screenWidth
  const handleResize = () => {
    // 仅在浏览器环境更新，以避免 SSR 错误
    if (typeof window !== 'undefined') {
      // 更新响应式状态 screenWidth
      screenWidth.value = window.innerWidth
    }
  }

  /**
   * 2. 注册和注销事件监听器的函数。
   * * Pinia Store 本身没有生命周期，所以需要依赖调用方（如 App.vue）
   * 传入 Vue 的 onMounted 和 onUnmounted 钩子来挂载事件。
   */
  const registerResizeListener = (
    mounted: typeof onMounted,
    unmounted: typeof onUnmounted
  ) => {
    if (typeof window !== 'undefined') {
      // 在组件挂载时添加监听
      mounted(() => {
        // 确保在添加监听前先调用一次，以获取初始的正确宽度
        handleResize()
        window.addEventListener('resize', handleResize)
      })

      // 在组件卸载时移除监听
      unmounted(() => {
        window.removeEventListener('resize', handleResize)
      })
    }
  }
  onMounted(() => {
    console.log('Device Store Mounted', isTMA.value, window.Telegram)
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      tg.enableClosingConfirmation()
      tg.MainButton.color = '#ff0000'
      tg.SecondaryButton.color = '#00ff00'
      tg.MainButton.setParams({
        color: '#ff0000',
        text_color: '#00ffff',
        text: '123456',
      })

      tg.setBackgroundColor('#ff0000')
      // 生效
      tg.setHeaderColor('#00ff00')
      // tg.showScanQrPopup({
      //   text: 'Scan this QR code to visit our website!',
      // })

      // tg.showPopup({
      //   title: 'Welcome to the Mini App!',
      //   message: 'This is a Telegram Mini App running inside Telegram.',
      //   buttons: [
      //     {
      //       text: 'Got it',
      //     },
      //   ],
      // })

      if (isMobilePhone) {
        // tg.requestFullscreen()
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
