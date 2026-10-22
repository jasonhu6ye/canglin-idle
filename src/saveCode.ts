import { migrate } from './core/sim';
import type { GameState } from './core/types';

/** 存档码：JSON 压缩后转 base64，前缀标明格式。浏览器不支持压缩时直接 base64 */
const PREFIX_Z = 'CL1Z:';
const PREFIX_P = 'CL1P:';

const toB64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export async function exportSave(s: GameState): Promise<string> {
  const raw = new TextEncoder().encode(JSON.stringify(s));
  if (typeof CompressionStream === 'undefined') return PREFIX_P + toB64(raw);
  return PREFIX_Z + toB64(await pipe(raw, new CompressionStream('deflate-raw')));
}

/** 解析存档码；格式不对或内容坏了返回 null */
export async function importSave(code: string): Promise<GameState | null> {
  const c = code.replace(/\s+/g, '');
  try {
    let bytes: Uint8Array;
    if (c.startsWith(PREFIX_Z)) bytes = await pipe(fromB64(c.slice(PREFIX_Z.length)), new DecompressionStream('deflate-raw'));
    else if (c.startsWith(PREFIX_P)) bytes = fromB64(c.slice(PREFIX_P.length));
    else return null;
    const s = migrate(JSON.parse(new TextDecoder().decode(bytes)));
    // 不让导入旧存档白拿离线收益：从现在开始算
    if (s) s.lastTick = Date.now();
    return s;
  } catch {
    return null;
  }
}
