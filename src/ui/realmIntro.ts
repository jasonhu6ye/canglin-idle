/**
 * 踏入永冬传送门时播放的 CG（另一个线程在做）。传送门先 await 这个函数再把人送进冰原。
 * 播完或点跳过后 resolve。这里先放一个空实现。
 */
export async function playRealmIntro(_opts: { from: 'canglin' | 'duskhaven'; lang: 'zh' | 'en'; outfit?: string }): Promise<void> {}
