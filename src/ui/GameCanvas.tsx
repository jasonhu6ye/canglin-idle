import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { DPR } from '../game/dpr';
import { MapScene, NODE_CLICK, REGION_CHANGE } from '../game/MapScene';

let game: Phaser.Game | null = null;

export function emitToGame(event: string, ...args: unknown[]) {
  game?.events.emit(event, ...args);
}

/** 订阅场景发出的事件（游戏可能晚于组件创建，所以挂在一个全局表上转发） */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;
const relays = new Map<string, Set<Listener>>();
export function onGameEvent(event: string, fn: Listener) {
  if (!relays.has(event)) relays.set(event, new Set());
  relays.get(event)!.add(fn);
  return () => {
    relays.get(event)!.delete(fn);
  };
}
const relay = (event: string): Listener => (...args) => relays.get(event)?.forEach((f) => f(...args));

export function GameCanvas({ onNodeClick }: { onNodeClick: (nodeId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current!;
    // 画布内部按 CSS 尺寸 × DPR 渲染，再用 zoom 缩回 CSS 尺寸
    const size = () => ({ w: Math.max(1, el.clientWidth) * DPR, h: Math.max(1, el.clientHeight) * DPR });
    const { w, h } = size();
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: el,
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / DPR },
      scene: [MapScene],
      banner: false,
      input: { touch: { capture: true } },
    });
    // 截图脚本用：?debug 时把游戏实例挂到 window 上
    if (location.search.includes("debug")) (window as unknown as { __game: Phaser.Game }).__game = game;
    const g = game;
    g.events.on(REGION_CHANGE, relay(REGION_CHANGE));
    const ro = new ResizeObserver(() => {
      const s = size();
      g.scale.resize(s.w, s.h);
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      g.destroy(true);
      if (game === g) game = null;
    };
  }, []);

  useEffect(() => {
    const g = game;
    g?.events.on(NODE_CLICK, onNodeClick);
    return () => {
      g?.events.off(NODE_CLICK, onNodeClick);
    };
  }, [onNodeClick]);

  return <div ref={ref} className="canvas" />;
}
