import type { ReactNode } from 'react';
import './Card.css';

export interface CardProps {
  children: ReactNode;
  className?: string;
  hoverable?: boolean;
}

export function Card({ children, className, hoverable = false }: CardProps) {
  const classes = ['card', hoverable ? 'card--hoverable' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
}
