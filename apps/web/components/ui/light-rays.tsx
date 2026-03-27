'use client'

import { useEffect, useState, type CSSProperties } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface LightRaysProps extends React.HTMLAttributes<HTMLDivElement> {
  count?: number
  color?: string
  blur?: number
  speed?: number
  length?: string
}

type LightRay = {
  id: string
  left: number
  rotate: number
  width: number
  swing: number
  delay: number
  duration: number
  intensity: number
}

function createRays(count: number, cycle: number): LightRay[] {
  if (count <= 0) return []

  return Array.from({ length: count }, (_, index) => {
    const left = 8 + Math.random() * 84
    const rotate = -28 + Math.random() * 56
    const width = 160 + Math.random() * 160
    const swing = 0.8 + Math.random() * 1.8
    const delay = Math.random() * cycle
    const duration = cycle * (0.75 + Math.random() * 0.5)
    const intensity = 0.6 + Math.random() * 0.5

    return {
      id: `${index}-${Math.round(left * 10)}`,
      left,
      rotate,
      width,
      swing,
      delay,
      duration,
      intensity,
    }
  })
}

function Ray({ left, rotate, width, swing, delay, duration, intensity }: LightRay) {
  return (
    <motion.div
      className="pointer-events-none absolute -top-[12%] h-[var(--light-rays-length)] origin-top -translate-x-1/2 rounded-full opacity-0"
      style={{
        left: `${left}%`,
        width: `${width}px`,
        background: `linear-gradient(to bottom, var(--light-rays-color), transparent)`,
        filter: `blur(var(--light-rays-blur))`,
      }}
      initial={{ rotate }}
      animate={{
        opacity: [0, intensity, 0],
        rotate: [rotate - swing, rotate + swing, rotate - swing],
      }}
      transition={{
        duration,
        repeat: Infinity,
        ease: 'easeInOut',
        delay,
        repeatDelay: duration * 0.1,
      }}
    />
  )
}

export function LightRays({
  className,
  style,
  count = 9,
  color = 'rgba(0, 175, 215, 0.35)',
  blur = 32,
  speed = 12,
  length = '80vh',
  ...props
}: LightRaysProps) {
  const [rays, setRays] = useState<LightRay[]>([])
  const cycleDuration = Math.max(speed, 0.1)

  useEffect(() => {
    setRays(createRays(count, cycleDuration))
  }, [count, cycleDuration])

  return (
    <div
      className={cn(
        'pointer-events-none absolute inset-0 isolate overflow-hidden rounded-[inherit]',
        className
      )}
      style={
        {
          '--light-rays-color': color,
          '--light-rays-blur': `${blur}px`,
          '--light-rays-length': length,
          ...style,
        } as CSSProperties
      }
      {...props}
    >
      <div className="absolute inset-0 overflow-hidden">
        {rays.map((ray) => (
          <Ray key={ray.id} {...ray} />
        ))}
      </div>
    </div>
  )
}
