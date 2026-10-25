import { useState } from 'react';
import { OUTFITS } from '../game/hero';
import { NAME_RE } from '../net/api';
import { adoptLocal, createCharacter, playOffline, retry, signIn, signUp, useOnline } from '../net/sync';
import { HeroPreview } from './Wardrobe';
import { tl } from '../i18n';
import { LangSwitch } from './LangSwitch';

/** 进游戏前的账号页（10-25 用户要求）：登录 / 注册 → 建角色 → 读云存档 */
const ERRS: [RegExp, string][] = [
  [/Failed to fetch|NetworkError|Load failed/i, tl('连不上服务器，请检查网络后再试')],
  [/Invalid login credentials/i, tl('邮箱或密码不对')],
  [/already registered/i, tl('这个邮箱已经注册过了，直接登录吧')],
  [/profiles_name_key|duplicate key/i, tl('这个名字已经有人用了，换一个吧')],
  [/valid email|invalid format/i, tl('邮箱格式不对')],
  [/rate limit/i, tl('操作太频繁，请稍等一会儿')],
];
export const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : String(e);
  return ERRS.find(([re]) => re.test(m))?.[1] ?? m;
};

/** 不用兑换码的外观才能在建角色时选 */
const STARTERS = OUTFITS.filter((o) => !o.code && !o.npc);

export function LoginGate() {
  const { phase } = useOnline();
  return (
    <div className="login-gate">
      <div className="login-box frame">
        <h1>{tl('苍岭放置')}</h1>
        {phase === 'loading' && <p className="muted">{tl('正在连接服务器…')}</p>}
        {phase === 'login' && <AuthForm />}
        {phase === 'create' && <CreateCharacter />}
        {phase === 'adopt' && <Adopt />}
        {phase === 'error' && (
          <>
            <p>{tl('连不上服务器。可能是网络不好，稍后再试。')}</p>
            <div className="go">
              <button className="primary" onClick={() => void retry()}>{tl('重试')}</button>
              <button onClick={playOffline}>{tl('先离线玩')}</button>
            </div>
            <p className="muted small">{tl('离线玩的进度存在这台设备上，下次连上后会自动传到云端。')}</p>
          </>
        )}
        <LangSwitch />
      </div>
    </div>
  );
}

function useAct() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await f(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  };
  return { busy, err, setErr, run };
}

function AuthForm() {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const { busy, err, setErr, run } = useAct();
  const submit = () => {
    if (pw.length < 6) return setErr(tl('密码至少 6 位'));
    if (mode === 'up' && pw !== pw2) return setErr(tl('两次输入的密码不一样'));
    void run(() => (mode === 'in' ? signIn(email.trim(), pw) : signUp(email.trim(), pw)));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div className="tabs-row">
        <button type="button" className={`pill ${mode === 'in' ? 'on' : ''}`} onClick={() => { setMode('in'); setErr(''); }}>{tl('登录')}</button>
        <button type="button" className={`pill ${mode === 'up' ? 'on' : ''}`} onClick={() => { setMode('up'); setErr(''); }}>{tl('注册账号')}</button>
      </div>
      <input type="email" placeholder={tl("邮箱")} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input type="password" placeholder={tl("密码（至少 6 位）")} autoComplete={mode === 'in' ? 'current-password' : 'new-password'} value={pw} onChange={(e) => setPw(e.target.value)} required />
      {mode === 'up' && <input type="password" placeholder={tl("再输一次密码")} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} required />}
      <button className="primary" disabled={busy}>{busy ? tl('请稍候…') : mode === 'in' ? tl('登录') : tl('注册')}</button>
      {err && <p className="err">{err}</p>}
      <p className="muted small">{tl('存档保存在云端，换手机或电脑登录同一个账号就能接着玩。')}</p>
    </form>
  );
}

function CreateCharacter() {
  const [name, setName] = useState('');
  const [pick, setPick] = useState(STARTERS[0].id);
  const { busy, err, setErr, run } = useAct();
  const sel = STARTERS.find((o) => o.id === pick) ?? STARTERS[0];
  const submit = () => {
    if (!NAME_RE.test(name)) return setErr(tl('名字 2-12 个字，只能用文字、数字和下划线'));
    void run(() => createCharacter(name, pick));
  };
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <h2>{tl('创建角色')}</h2>
      <div className="create-stage">
        <HeroPreview outfit={sel} scale={4} />
        <div>
          <b>{sel.name}</b>
          <p className="muted small">{sel.desc}</p>
        </div>
      </div>
      <div className="chips-row">
        {STARTERS.map((o) => (
          <button type="button" key={o.id} className={`pill ${pick === o.id ? 'on' : ''}`} onClick={() => setPick(o.id)}>{o.name}</button>
        ))}
      </div>
      <input placeholder={tl("角色名（2-12 个字，其他玩家能看到）")} maxLength={12} value={name} onChange={(e) => setName(e.target.value)} required />
      <button className="primary" disabled={busy}>{busy ? tl('请稍候…') : tl('进入苍岭')}</button>
      {err && <p className="err">{err}</p>}
      <p className="muted small">{tl('外观以后可以在「更多 → 衣橱」里换。')}</p>
    </form>
  );
}

function Adopt() {
  return (
    <>
      <h2>{tl('这台设备上有以前的进度')}</h2>
      <p>{tl('要把它带进这个账号吗？带进去后会上传到云端，以后在别的设备登录也能接着玩。')}</p>
      <div className="go">
        <button className="primary" onClick={() => adoptLocal(true)}>{tl('带入现有进度')}</button>
        <button onClick={() => confirm(tl('确定从头开始？这台设备上以前的进度会被新角色覆盖。')) && adoptLocal(false)}>{tl('从头开始')}</button>
      </div>
    </>
  );
}
