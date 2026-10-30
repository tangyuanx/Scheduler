// 在 Node 里预置浏览器全局，供 SSR 冒烟测试使用
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
}
globalThis.document = {
  documentElement: { setAttribute() {}, getAttribute: () => 'light' },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.window = globalThis
