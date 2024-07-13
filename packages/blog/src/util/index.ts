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