'use client';

import { useState, useEffect, useRef } from 'react';

export default function ScrollNav({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const lastY = useRef(0);
  const hiddenRef = useRef(false);
  const scrolledRef = useRef(false);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      const shouldHide = y > lastY.current && y > 80;
      const isScrolled = y > 20;
      if (shouldHide !== hiddenRef.current) {
        hiddenRef.current = shouldHide;
        setHidden(shouldHide);
      }
      if (isScrolled !== scrolledRef.current) {
        scrolledRef.current = isScrolled;
        setScrolled(isScrolled);
      }
      lastY.current = y;
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <nav
      aria-label='Main navigation'
      className={`group/nav fixed w-full z-50 pointer-events-none transition-all duration-300 ${
        hidden ? '-translate-y-full' : 'translate-y-0'
      } ${scrolled ? 'bg-[var(--bg-nav-blur)] backdrop-blur-xl shadow-sm' : ''}`}
      data-scrolled={scrolled || undefined}
    >
      {children}
    </nav>
  );
}
