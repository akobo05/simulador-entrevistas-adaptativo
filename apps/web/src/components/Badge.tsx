import './Badge.css';

export type BadgeColor = 'primary' | 'accent' | 'muted' | 'danger' | 'success';

export interface BadgeProps {
  label: string;
  color?: BadgeColor;
}

export function Badge({ label, color = 'muted' }: BadgeProps) {
  return <span className={`badge badge--${color}`}>{label}</span>;
}
