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

/** 导入失败的原因，给玩家看 */
export let importError = '';

/** 解析存档码；格式不对或内容坏了返回 null，原因写在 importError */
export async function importSave(code: string): Promise<GameState | null> {
  // 聊天软件、备忘录复制出来常带空格、换行、零宽字符、全角冒号或引号，全部去掉
  let c = code.replace(/[\s\u200b-\u200d\ufeff"'“”‘’`]/g, '').replace('：', ':');
  // 网址安全的 base64 也认
  c = c.replace(/-/g, '+').replace(/_/g, '/');
  importError = '';
  const at = c.search(/CL1[ZP]:/);
  if (at > 0) c = c.slice(at);
  let bytes: Uint8Array;
  try {
    if (c.startsWith(PREFIX_Z)) bytes = await pipe(fromB64(pad(c.slice(PREFIX_Z.length))), new DecompressionStream('deflate-raw'));
    else if (c.startsWith(PREFIX_P)) bytes = fromB64(pad(c.slice(PREFIX_P.length)));
    else {
      // 没有开头的 CL1Z: 也试一下
      try {
        bytes = await pipe(fromB64(pad(c)), new DecompressionStream('deflate-raw'));
      } catch {
        importError = '存档码开头应该是「CL1Z:」，这串码缺了开头，可能没复制完整（文本框要从最上面开始全选）';
        return null;
      }
    }
  } catch {
    importError = '存档码解不开：中间缺了字或多了字，请重新导出、完整复制';
    return null;
  }
  try {
    const s = migrate(JSON.parse(new TextDecoder().decode(bytes)));
    // 不让导入旧存档白拿离线收益：从现在开始算
    if (s) s.lastTick = Date.now();
    else importError = '存档内容不认识';
    return s;
  } catch (e) {
    importError = `存档码能解开，但读取存档出错：${String(e).slice(0, 80)}`;
    return null;
  }
}

const pad = (b: string) => b + '='.repeat((4 - (b.length % 4)) % 4);
