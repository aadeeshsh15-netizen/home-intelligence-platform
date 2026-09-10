import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'error' | 'critical' | 'info' | 'outline';
  size?: 'sm' | 'md';
}

export function Badge({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}: BadgeProps) {
  const variantStyles = {
    default: 'bg-slate-800 text-slate-300 border-slate-700',
    success: 'bg-emerald-950/60 text-emerald-400 border-emerald-800/80',
    warning: 'bg-amber-950/60 text-amber-400 border-amber-800/80',
    error: 'bg-rose-950/60 text-rose-400 border-rose-800/80',
    critical: 'bg-red-950 text-red-300 border-red-700 animate-pulse',
    info: 'bg-sky-950/60 text-sky-400 border-sky-800/80',
    outline: 'bg-transparent text-slate-400 border-slate-700',
  };

  const sizeStyles = {
    sm: 'px-1.5 py-0.5 text-[10px]',
    md: 'px-2 py-1 text-xs',
  };

  return (
    <span
      className={twMerge(
        'inline-flex items-center gap-1 rounded font-mono font-medium border uppercase tracking-wider',
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
