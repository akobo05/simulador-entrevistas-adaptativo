import type { ButtonHTMLAttributes, ReactNode } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
}

export function Button({ children, className, ...props }: ButtonProps) {
  return (
    <button className={['btn', className].filter(Boolean).join(' ')} {...props}>
      {children}
    </button>
  );
}
