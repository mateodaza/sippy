'use client';

import { useState, useEffect } from 'react';

export function LiveClock({ className = '' }: { className?: string }) {
  const [time, setTime] = useState('00:00:00');

  useEffect(() => {
    const fmt = () => {
      const now = new Date();
      return now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    };
    setTime(fmt());
    const id = setInterval(() => setTime(fmt()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className={className}>{time || '00:00:00'}</span>
  );
}
