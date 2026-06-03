import type { ButtonHTMLAttributes, ReactNode } from 'react';
import './Button.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
  fullWidth?: boolean;
  children?: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  fullWidth = false,
  children,
  className,
  disabled,
  ...props
}: ButtonProps) {
  const classes = [
    'btn2',
    `btn2--${variant}`,
    `btn2--${size}`,
    fullWidth ? 'btn2--full' : '',
    loading ? 'btn2--loading' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={classes} disabled={disabled || loading} aria-busy={loading} {...props}>
      {loading && <span className="btn2__spinner" aria-hidden="true" />}

      {!loading && icon && (
        <span className="btn2__icon" aria-hidden="true">
          {icon}
        </span>
      )}

      {children && <span className="btn2__label">{children}</span>}
    </button>
  );
}
