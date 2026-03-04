'use client';

import { useState, useEffect, useRef } from 'react';

export default function ScrollNav({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const lastY = useRef(0);
  const hiddenRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const shouldHide = y > lastY.current && y > 80;
      if (shouldHide !== hiddenRef.current) {
        hiddenRef.current = shouldHide;
        setHidden(shouldHide);
      }
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      className={`sticky top-0 z-50 bg-white/80 backdrop-blur-lg border-b border-white/60 transition-transform duration-300 ${
        hidden ? '-translate-y-full' : 'translate-y-0'
      }`}
    >
      {children}
    </nav>
  );
}
