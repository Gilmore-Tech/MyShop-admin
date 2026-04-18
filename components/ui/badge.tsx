'use client';
import React from 'react';

interface BadgeProps {
  count?: number;
  showDot?: boolean;
  size?: 'xs' | 'sm' | 'md';
  ariaLabel?: string;
  className?: string;
}

const sizeMap: Record<NonNullable<BadgeProps['size']>, { w: string; text: string }> = {
  xs: { w: 'w-4 h-4', text: 'text-[9px]' },
  sm: { w: 'w-5 h-5', text: 'text-xs' },
  md: { w: 'w-6 h-6', text: 'text-sm' }
};

export default function Badge({ count, showDot, size = 'sm', ariaLabel, className = '' }: BadgeProps) {
  const { w, text } = sizeMap[size];

  if ((count === undefined || count === 0) && !showDot) return null;

  if (showDot && (count === undefined || count === 0)) {
    // small red dot
    return (
      <span
        role={ariaLabel ? 'status' : undefined}
        aria-label={ariaLabel}
        className={`${className} inline-block bg-red-500 rounded-full ${w} ${text} ring-2 ring-white`}
      />
    );
  }

  return (
    <span
      role="status"
      aria-label={ariaLabel}
      className={`${className} inline-flex items-center justify-center bg-red-500 text-white rounded-full ${w} ${text} font-semibold`}
    >
      {count && count > 99 ? '99+' : count}
    </span>
  );
}
