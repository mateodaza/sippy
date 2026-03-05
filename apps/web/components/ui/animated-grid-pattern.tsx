'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface GridPatternProps {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  squares?: Array<[x: number, y: number]>;
  strokeDasharray?: number;
  className?: string;
  [key: string]: any;
}

export function AnimatedGridPattern({
  width = 40,
  height = 40,
  x = -1,
  y = -1,
  strokeDasharray = 0,
  squares,
  className,
  ...props
}: GridPatternProps) {
  const id = useId();
  const containerRef = useRef<SVGSVGElement>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient) return;

    const updateDimensions = () => {
      if (containerRef.current) {
        const { width, height } = containerRef.current.getBoundingClientRect();
        setDimensions({ width, height });
      }
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [isClient]);

  const cols = Math.ceil((dimensions.width + width) / width);
  const rows = Math.ceil((dimensions.height + height) / height);

  return (
    <svg
      ref={containerRef}
      aria-hidden='true'
      className={cn(
        'pointer-events-none absolute inset-0 h-full w-full fill-gray-400/20 stroke-gray-400/20',
        className
      )}
      {...props}
    >
      <defs>
        <pattern
          id={id}
          width={width}
          height={height}
          patternUnits='userSpaceOnUse'
          x={x}
          y={y}
        >
          <path
            d={`M.5 ${height}V.5H${width}`}
            fill='none'
            strokeDasharray={strokeDasharray}
          />
        </pattern>
      </defs>
      <rect width='100%' height='100%' fill={`url(#${id})`} />
      {squares && (
        <svg x={x} y={y} className='overflow-visible'>
          {squares.map(([x, y], index) => (
            <rect
              key={`${x}-${y}-${index}`}
              width={width - 1}
              height={height - 1}
              x={x * width + 1}
              y={y * height + 1}
              className='fill-gray-400/40 stroke-gray-400/40 animate-pulse'
              style={{
                animationDelay: `${index * 0.1}s`,
                animationDuration: '2s',
              }}
            />
          ))}
        </svg>
      )}
    </svg>
  );
}
