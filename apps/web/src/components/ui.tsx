import type { Classification } from '@dama/engine';
import { type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, useId } from 'react';
import { CLASSIFICATION_META } from '../lib/format.ts';
import s from './ui.module.css';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'small' | 'medium' | 'large';
  icon?: boolean;
  block?: boolean;
  loading?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'medium',
  icon,
  block,
  loading,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const classes = [
    s.button,
    variant !== 'secondary' && s[variant],
    size !== 'medium' && s[size],
    icon && s.icon,
    block && s.block,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <span className={s.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`${s.card} ${className ?? ''}`} {...rest}>
      {children}
    </section>
  );
}

export interface SegmentOption<T extends string | number> {
  readonly value: T;
  readonly label: string;
  readonly sub?: string;
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  const move = (dir: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length]!;
    onChange(next.value);
  };
  return (
    <div
      className={s.segmented}
      role="radiogroup"
      aria-label={label}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          tabIndex={o.value === value ? 0 : -1}
          className={s.segment}
          onClick={() => onChange(o.value)}
        >
          {o.label}
          {o.sub && <span className={s.segmentSub}>{o.sub}</span>}
        </button>
      ))}
    </div>
  );
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className={s.switchRow}>
      <div>
        <label htmlFor={id} style={{ fontWeight: 560, cursor: 'pointer' }}>
          {label}
        </label>
        {description && <p className={s.help}>{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={s.switch}
        onClick={() => onChange(!checked)}
      />
    </div>
  );
}

export function Badge({ tone = 'neutral', children }: { tone?: string; children: ReactNode }) {
  return <span className={`${s.badge} ${s[`tone_${tone}`] ?? ''}`}>{children}</span>;
}

export function ClassificationBadge({ value }: { value: Classification }) {
  const meta = CLASSIFICATION_META[value];
  return (
    <Badge tone={meta.tone}>
      <span className="mono" aria-hidden="true">
        {meta.glyph}
      </span>
      {meta.label}
    </Badge>
  );
}

export function Empty({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className={s.empty}>
      {icon}
      <p style={{ color: 'var(--text)', fontWeight: 600 }}>{title}</p>
      {children}
    </div>
  );
}

export function Skeleton({
  height = 20,
  width = '100%',
}: {
  height?: number | string;
  width?: number | string;
}) {
  return <div className={s.skeleton} style={{ height, width }} aria-hidden="true" />;
}

export const ui = s;
