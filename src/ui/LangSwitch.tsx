import { LANG, setLang, type Lang } from '../i18n';

// 语言切换的文字两种语言都要看得懂，不翻译
const LANG_NAME: Record<Lang, string> = { zh: '中文', en: 'English' }; // i18n-ignore

/** 中文 / English 切换；换语言会刷新页面，before 用来先存档 */
export function LangSwitch({ before }: { before?: () => void }) {
  return (
    <div className="tabs-row lang-row">
      {(['zh', 'en'] as const).map((l) => (
        <button key={l} type="button" className={`pill ${LANG === l ? 'on' : ''}`} onClick={() => { if (LANG !== l) { before?.(); setLang(l); } }}>{LANG_NAME[l]}</button>
      ))}
    </div>
  );
}
