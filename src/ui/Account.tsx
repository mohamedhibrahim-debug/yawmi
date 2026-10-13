import { useEffect, useRef, useState } from 'preact/hooks';
import type { Account } from '../platform/cloud';

// The Supabase client loads only when someone actually signs in.
const cloud = () => import('../platform/cloud');
const isEmail = (s: string) => /^[^s@]+@[^s@]+.[^s@]{2,}$/.test(s.trim());
import { locale, t } from '../i18n';
import { Segmented, Sheet } from './kit';

export function whenLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat(locale() === 'ar' ? 'ar-EG' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return iso;
  }
}

/** Email or mobile number → 6-digit code → signed in. */
export function LoginSheet(props: { onDone: (a: Account) => void; onClose: () => void }) {
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [contact, setContact] = useState('');
  const [sent, setSent] = useState<{ kind: 'email' | 'phone'; to: string } | null>(null);
  const [code, setCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (sent && (sent.kind === 'phone' || showCode)) codeRef.current?.focus(); }, [sent, showCode]);

  const fail = (e: unknown) => setError(t(e instanceof Error && e.name !== 'TypeError' && e.message && !e.message.includes(' ') ? e.message : 'loginFailed'));

  const send = async () => {
    setError(null);
    setBusy(true);
    try { setSent(await (await cloud()).sendCode(contact)); } catch (e) { fail(e); }
    setBusy(false);
  };
  const verify = async () => {
    if (!sent) return;
    setError(null);
    setBusy(true);
    try { props.onDone(await (await cloud()).verifyCode(sent.kind, sent.to, code)); } catch (e) { fail(e); }
    setBusy(false);
  };

  // Typing an @ switches to email; typing digits switches to phone, so one box works for both.
  const onContact = (v: string) => {
    setContact(v);
    if (v.includes('@')) setMode('email');
    else if (/^[+0٠]?[\d٠-٩\s-]{3,}$/.test(v.trim())) setMode('phone');
  };

  return (
    <Sheet title={t('loginTitle')} onClose={props.onClose}>
      <div class="login">
        <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" class="login-logo" />
        {!sent ? (
          <>
            <p class="hint center-text">{t('loginBody')}</p>
            <Segmented<'email' | 'phone'> label={t('contactPh')} value={mode} onChange={setMode}
              options={[{ value: 'email', label: locale() === 'ar' ? 'إيميل' : 'Email' }, { value: 'phone', label: locale() === 'ar' ? 'موبايل' : 'Mobile' }]} />
            <input class="login-input" value={contact} autoFocus
              type={mode === 'email' ? 'email' : 'tel'} inputMode={mode === 'email' ? 'email' : 'tel'}
              autoComplete={mode === 'email' ? 'email' : 'tel'} dir="ltr"
              placeholder={mode === 'email' ? 'name@example.com' : '01012345678'} aria-label={t('contactPh')}
              onInput={(e) => onContact(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void send(); }} />
            <button class="btn primary wide" disabled={busy || !contact.trim() || (mode === 'email' && !isEmail(contact))} onClick={() => void send()}>{t('sendCode')}</button>
          </>
        ) : (
          <>
            <p class="hint center-text">{sent.kind === 'email' ? t('codeSentEmail', { to: sent.to }) : t('codeSentPhone', { to: sent.to })}</p>
            {sent.kind === 'email' && !showCode ? (
              <button class="text-btn" onClick={() => setShowCode(true)}>{t('haveCode')}</button>
            ) : (<>
            <input ref={codeRef} class="login-input code" value={code} inputMode="numeric" autoComplete="one-time-code" maxLength={8} dir="ltr"
              placeholder="••••••" aria-label={t('codePh')}
              onInput={(e) => { const v = e.currentTarget.value; setCode(v); if (v.replace(/\D/g, '').length === 6) void verifyNow(v); }} />
            <button class="btn primary wide" disabled={busy || code.replace(/\D/g, '').length < 6} onClick={() => void verify()}>{t('verify')}</button>
            <div class="login-links">
              <button class="text-btn" onClick={() => { setSent(null); setCode(''); setError(null); }}>{t('changeContact')}</button>
              <button class="text-btn" disabled={busy} onClick={() => void send()}>{t('resend')}</button>
            </div>
          </>
        )}
        {error && <p class="inline-error" role="alert">{error}</p>}
      </div>
    </Sheet>
  );

  async function verifyNow(v: string) {
    if (!sent || busy) return;
    setBusy(true);
    setError(null);
    try { props.onDone(await (await cloud()).verifyCode(sent.kind, sent.to, v)); } catch (e) { fail(e); }
    setBusy(false);
  }
}
