/** 点物品图标弹详情：图标只管发请求，App 里的弹窗负责显示 */
type Listener = (id: string | null) => void;
const listeners = new Set<Listener>();

export function openItem(id: string | null) {
  listeners.forEach((f) => f(id));
}

/** 开宝箱、福袋的结果弹窗 */
type LootListener = (r: { from: string; got: Record<string, number> } | null) => void;
const lootListeners = new Set<LootListener>();
export function showLoot(r: { from: string; got: Record<string, number> } | null) {
  lootListeners.forEach((f) => f(r));
}
export function onShowLoot(fn: LootListener) {
  lootListeners.add(fn);
  return () => {
    lootListeners.delete(fn);
  };
}

export function onOpenItem(fn: Listener) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** 电脑端（有鼠标）：左键看物品详情，右键直接用（用户 10-23） */
export const FINE_POINTER = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;

/** 打开某个地点的页面（配方里点缺的材料跳过去用） */
type NodeListener = (id: string) => void;
const nodeListeners = new Set<NodeListener>();
export function openNodeSheet(id: string) {
  nodeListeners.forEach((f) => f(id));
}
export function onOpenNodeSheet(fn: NodeListener) {
  nodeListeners.add(fn);
  return () => { nodeListeners.delete(fn); };
}
