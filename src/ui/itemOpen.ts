/** 点物品图标弹详情：图标只管发请求，App 里的弹窗负责显示 */
type Listener = (id: string | null) => void;
const listeners = new Set<Listener>();

export function openItem(id: string | null) {
  listeners.forEach((f) => f(id));
}

export function onOpenItem(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
