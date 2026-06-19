import { ref, onMounted, onUnmounted, computed } from 'vue'

// 定义设备类型的枚举或常量
const DEVICE_TYPE = {
  MOBILE: 'mobile', // 广义手机/小型移动设备
  WEB: 'web', // 通用桌面/PC
  IPAD: 'ipad', // 新增：iPad/平板设备
  TMA: 'tma', // Telegram Mini App
}

// 检查是否为 TMA
function checkIsTMA() {
  return (
    typeof window.Telegram !== 'undefined' &&
    typeof window.Telegram.WebApp !== 'undefined'
  )
}

/**
 * 响应式地判断当前设备类型
 */
export function useDeviceType() {
  const userAgent = ref(navigator.userAgent)
  const screenWidth = ref(window.innerWidth)

  const isTMA = ref(checkIsTMA())

  // --- 核心判断逻辑 ---

  // 1. 判断是否为 iPad
  const isIPad = computed(() => {
    // 检查是否是 'iPad' 关键词 (适用于老版本 iOS 或某些非标准浏览器)
    const isIOSPad = /iPad/i.test(userAgent.value)

    // 检查是否是伪装的 Mac 且支持触摸 (适用于 iOS 13+ 的 iPadOS)
    const isMacSimulatedTouch =
      /Macintosh/i.test(userAgent.value) && 'ontouchend' in document // 检查是否支持触摸事件

    return !isTMA.value && (isIOSPad || isMacSimulatedTouch)
  })

  // 2. 广义判断是否为手机 (排除 TMA 和 iPad)
  const isMobilePhone = computed(() => {
    // 排除 TMA 和 iPad，然后检查常见的手机 UA 关键词
    return (
      !isTMA.value &&
      !isIPad.value &&
      (/Android|webOS|iPhone|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        userAgent.value
      ) ||
        // 辅助判断：屏幕宽度小于一个阈值（如 768px）
        screenWidth.value <= 768)
    )
  })

  // 3. 最终设备类型判断
  const deviceType = computed(() => {
    if (isTMA.value) {
      return DEVICE_TYPE.TMA
    }
    if (isIPad.value) {
      return DEVICE_TYPE.IPAD
    }
    if (isMobilePhone.value) {
      return DEVICE_TYPE.MOBILE
    }
    return DEVICE_TYPE.WEB
  })

  // --- 响应式监听 ---
  const handleResize = () => {
    screenWidth.value = window.innerWidth
  }

  onMounted(() => {
    window.addEventListener('resize', handleResize)
  })

  onUnmounted(() => {
    window.removeEventListener('resize', handleResize)
  })

  return {
    deviceType,
    isMobile: isMobilePhone, // 注意：这里特指手机
    isWeb: computed(() => deviceType.value === DEVICE_TYPE.WEB),
    isIPad, // 暴露 iPad 状态
    isTelegramMiniApp: isTMA,
    DEVICE_TYPE,
  }
}
