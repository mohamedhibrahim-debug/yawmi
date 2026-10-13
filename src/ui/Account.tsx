import { useState } from 'preact/hooks';
import type { Account } from '../platform/cloud';
import { locale, t } from '../i18n';
import { Segmented, Sheet } from './kit';

// The Supabase client loads only when someone actually signs in.
const cloud = () => import('../platform/cloud');
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
const MIN_PASSWORD = 8;

export function whenLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale() === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Standard account form: sign in with email + password, or create one with name, email, password. */
export function LoginSheet(props: { initialMode?: 'signin' | 'signup'; onDone: (a: Account) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'signin' | 'signup'>(props.initialMode ?? 'signin');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = isEmail(email) && password.length >= (mode === 'signup' ? MIN_PASSWORD : 1) && (mode === 'signin' || name.trim().length > 0);

  const submit = async (e: Event) => {
    e.preventDefault();
    if (!valid || busy) return;
    setError(null);
    setBusy(true);
    try {
      const c = await cloud();
      props.onDone(mode === 'signup' ? await c.signUp(name, email, password) : await c.signIn(email, password));
    } catch (err) {
      // A part of the app that an update replaced: reload to the new version instead of failing.
      if (err instanceof TypeError && /module|import|fetch dynamically/i.test(err.message)) { location.reload(); return; }
      setError(t(err instanceof Error && err.message && !err.message.includes(' ') ? err.message : 'loginFailed'));
    }
    setBusy(false);
  };

  return (
    <Sheet title={mode === 'signup' ? t('createAccount') : t('signIn')} onClose={props.onClose}>
      <form class="login" onSubmit={submit} noValidate>
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" class="login-logo" />
        <Segmented<'signin' | 'signup'> label={t('signIn')} value={mode} onChange={(m) => { setMode(m); setError(null); }}
          options={[{ value: 'signin', label: t('signIn') }, { value: 'signup', label: t('createAccount') }]} />

        <div class="field-stack">
          {mode === 'signup' && (
            <label class="fl">
              <span>{t('yourName')}</span>
              <input value={name} autoComplete="name" maxLength={40} onInput={(e) => setName(e.currentTarget.value)} />
            </label>
          )}
          <label class="fl">
            <span>{t('email')}</span>
            <input type="email" inputMode="email" autoComplete={mode === 'signup' ? 'email' : 'username'} dir="ltr"
              autoCapitalize="none" autoCorrect="off" spellcheck={false} value={email} onInput={(e) => setEmail(e.currentTarget.value)} />
          </label>
          <label class="fl">
            <span>{t('password')}</span>
            <div class="pw">
              <input type={show ? 'text' : 'password'} dir="ltr" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                value={password} onInput={(e) => setPassword(e.currentTarget.value)} />
              <button type="button" class="text-btn" onClick={() => setShow(!show)}>{show ? t('hide') : t('show')}</button>
            </div>
          </label>
        </div>
        {mode === 'signup' && <p class="hint">{t('passwordHint', { n: MIN_PASSWORD })}</p>}

        <button type="submit" class="btn primary wide" disabled={!valid || busy}>
          {busy ? '…' : mode === 'signup' ? t('createAccount') : t('signIn')}
        </button>
        {error && <p class="inline-error" role="alert">{error}</p>}
        <button type="button" class="text-btn center-self" onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(null); }}>
          {mode === 'signin' ? t('noAccount') : t('haveAccountShort')}
        </button>
      </form>
    </Sheet>
  );
}
