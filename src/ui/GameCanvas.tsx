import Phaser from 'phaser';
import { useEffect, useRef } from 'react';
import { MapScene, NODE_CLICK } from '../game/MapScene';

let game: Phaser.Game | null = null;

export function emitToGame(event: string, ...args: unknown[]) {
  game?.events.emit(event, ...args);
}

export function GameCanvas({ onNodeClick }: { onNodeClick: (nodeId: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: ref.current!,
      pixelArt: true,
      roundPixels: true,
      scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
      scene: [MapScene],
      banner: false,
    });
    return () => {
      game?.destroy(true);
      game = null;
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
