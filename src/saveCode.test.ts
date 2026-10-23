import { exportSave, importSave } from './saveCode';
import { newGame } from './core/sim';

describe('存档码', () => {
  it('导出再导入能还原，带换行、引号、缺开头也认', async () => {
    const s = newGame(Date.now());
    const code = await exportSave(s);
    expect((await importSave(code))?.version).toBe(s.version);
    const messy = `“${code.slice(0, 40)}\n ${code.slice(40)}”`;
    expect(await importSave(messy)).not.toBeNull();
    expect(await importSave(code.slice(5))).not.toBeNull();
    expect(await importSave(code.slice(0, code.length - 30))).toBeNull();
  });
});
