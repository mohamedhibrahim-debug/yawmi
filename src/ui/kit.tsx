// Small building blocks shared by every screen: sheets, chips, segmented controls, icons.
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { t } from '../i18n';
import { tap } from '../platform/native';

export function Sheet(props: { title?: string; onClose: () => void; children: ComponentChildren; leading?: ComponentChildren; trailing?: ComponentChildren; tall?: boolean; label?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
    const onCancel = (e: Event) => { e.preventDefault(); props.onClose(); };
    d?.addEventListener('cancel', onCancel);
    return () => d?.removeEventListener('cancel', onCancel);
  }, []);
  return (
    <dialog ref={ref} class={`sheet${props.tall ? ' tall' : ''}`} aria-label={props.label ?? props.title}
      onClick={(e) => { if (e.target === ref.current) props.onClose(); }}>
      <div class="grabber" aria-hidden="true" />
      {(props.title || props.leading || props.trailing) && (
        <header class="sheet-bar">
          <div class="sheet-side">{props.leading ?? <button class="text-btn" onClick={props.onClose}>{t('cancel')}</button>}</div>
          <h2>{props.title ?? ''}</h2>
          <div class="sheet-side end">{props.trailing}</div>
        </header>
      )}
      <div class="sheet-body">{props.children}</div>
    </dialog>
  );
}

export function Chips<T extends string | number>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div class="chips" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button role="radio" aria-checked={o.value === props.value} class={`chip${o.value === props.value ? ' on' : ''}`}
          onClick={() => { tap(); props.onChange(o.value); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Segmented<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div class="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button role="radio" aria-checked={o.value === props.value} class={o.value === props.value ? 'on' : ''}
          onClick={() => { tap(); props.onChange(o.value); }}>{o.label}</button>
      ))}
    </div>
  );
}

export function Toggle(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={props.checked} aria-label={props.label} class={`switch${props.checked ? ' on' : ''}`}
      onClick={() => { tap(); props.onChange(!props.checked); }}><span /></button>
  );
}

const PATHS = {
  today: 'M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10Zm0-5a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0V3a1 1 0 0 1 1-1Zm0 17a1 1 0 0 1 1 1v1a1 1 0 1 1-2 0v-1a1 1 0 0 1 1-1ZM3 11h1a1 1 0 1 1 0 2H3a1 1 0 1 1 0-2Zm17 0h1a1 1 0 1 1 0 2h-1a1 1 0 1 1 0-2ZM5.6 4.2l.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 1.4-1.4Zm13.5 13.5.7.7a1 1 0 0 1-1.4 1.4l-.7-.7a1 1 0 0 1 1.4-1.4ZM4.2 18.4l.7-.7a1 1 0 0 1 1.4 1.4l-.7.7a1 1 0 0 1-1.4-1.4ZM17.7 4.9l.7-.7a1 1 0 0 1 1.4 1.4l-.7.7a1 1 0 0 1-1.4-1.4Z',
  routines: 'M12 4a8 8 0 0 0-7.4 5H2l3.5 4L9 9H6.8A6 6 0 1 1 6 12H4a8 8 0 1 0 8-8Z',
  history: 'M12 3a9 9 0 1 1-9 9h2a7 7 0 1 0 2.1-5L9 9H3V3l2.6 2.6A9 9 0 0 1 12 3Zm-1 4h2v4.6l3.2 1.9-1 1.7L11 12.7V7Z',
  settings: 'M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8.4 4.6.1-1.1-.1-1.1 2-1.6-2-3.4-2.4 1a8 8 0 0 0-1.9-1.1L15.7 3h-4l-.4 2.5a8 8 0 0 0-1.9 1.1L7 5.6 5 9l2 1.6-.1 1.4.1 1.1-2 1.6 2 3.4 2.4-1c.6.5 1.2.8 1.9 1.1l.4 2.6h4l.4-2.6c.7-.3 1.3-.6 1.9-1.1l2.4 1 2-3.4-2-1.5Z',
  mic: 'M12 15a3.5 3.5 0 0 0 3.5-3.5v-6a3.5 3.5 0 1 0-7 0v6A3.5 3.5 0 0 0 12 15Zm6-3.5a1 1 0 1 0-2 0 4 4 0 0 1-8 0 1 1 0 1 0-2 0 6 6 0 0 0 5 5.9V20H8.5a1 1 0 1 0 0 2h7a1 1 0 1 0 0-2H13v-2.6a6 6 0 0 0 5-5.9Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z',
  play: 'M8 5.5v13a1 1 0 0 0 1.5.9l10-6.5a1 1 0 0 0 0-1.7l-10-6.6A1 1 0 0 0 8 5.5Z',
  pause: 'M7 5h3v14H7V5Zm7 0h3v14h-3V5Z',
  hourglass: 'M6 2h12v2h-1v3.2a3 3 0 0 1-.9 2.1L13.4 12l2.7 2.7a3 3 0 0 1 .9 2.1V20h1v2H6v-2h1v-3.2a3 3 0 0 1 .9-2.1l2.7-2.7-2.7-2.7A3 3 0 0 1 7 7.2V4H6V2Zm3 2v3.2l3 3 3-3V4H9Z',
  arrow: 'M14 6 8 12l6 6 1.4-1.4L10.8 12l4.6-4.6L14 6Z',
  keyboard: 'M3 6h18a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Zm1 2v8h16V8H4Zm2 1h2v2H6V9Zm3 0h2v2H9V9Zm3 0h2v2h-2V9Zm3 0h2v2h-2V9ZM7 13h10v2H7v-2Z',
  trash: 'M9 3h6l1 2h4v2H4V5h4l1-2Zm-3 6h12l-1 12H7L6 9Z',
  check: 'M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6L20.1 8.4 18.7 7l-9.2 9.2Z'
} as const;
export type IconName = keyof typeof PATHS;

export function Icon(props: { name: IconName; size?: number; class?: string }) {
  const s = props.size ?? 24;
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} aria-hidden="true" class={`ico ${props.class ?? ''}`}>
      <path fill="currentColor" d={PATHS[props.name]} />
    </svg>
  );
}
