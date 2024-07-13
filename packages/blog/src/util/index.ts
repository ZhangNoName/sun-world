import { GithubAdress } from "@/constant";

/**
 * 拦截localStorage变化事件
 * 普通的localStorage无法监听到同tab变化事件，导致其他组件更改了localStorage值，无法在app.vue中监听到变化
 */
export function InterceptLocalStorage() {
  const originalSetItem = localStorage.setItem;
  localStorage.setItem = function (key: string, newValue: string) {
    const event = new Event('localestorageChange') as CustomEvent;
    (event as any).key = key;
    (event as any).newValue = newValue;
    window.dispatchEvent(event);
    originalSetItem.apply(this, [key, newValue]);
  };

}
/**
 * 储存当前地址经纬度
 *  longitude:经度
 *  latitude:纬度
 */
export const CurrentLocation = {
  latitude: 0,
  longitude: 0,
}



/**
 * 在标签页打开github
 */
export const openGithub = () => {
  window.open(GithubAdress, '_blank')
}


/**
 * 获取当前地址经纬度
 * returns Promise<{latitude: number, longitude: number}>
 */
export const getCurrentLocation = (): Promise<{ latitude: number, longitude: number }> => {
  return new Promise((resolve, reject) => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const latitude = position.coords.latitude;
          const longitude = position.coords.longitude;
          CurrentLocation.latitude = latitude;
          CurrentLocation.longitude = longitude;
          resolve({ latitude, longitude });
        },
        (error) => {
          reject(new Error("获取位置信息失败: " + error.message));
        }
      );
    } else {
      reject(new Error("您的浏览器不支持地理位置功能。"));
    }
  });
}

/**
 * 根据经纬度获取地址
 */
export const getAdressByLocation = () => {

}

