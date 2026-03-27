import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Sippy — Send Dollars via WhatsApp'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OGImage() {
  return new ImageResponse(
    <div
      style={{
        background: '#0D0D1A',
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle grid overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(to right, rgba(0,175,215,0.04) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,175,215,0.04) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* S/5 mark — geometric rectangles in cheetah blue */}
      <svg width="180" height="350" viewBox="368 220 288 560" style={{ display: 'flex' }}>
        <rect fill="#00AFD7" x="368" y="220" width="288" height="48" />
        <rect fill="#00AFD7" x="368" y="316" width="288" height="48" />
        <rect fill="#00AFD7" x="608" y="412" width="48" height="368" />
        <rect fill="#00AFD7" x="368" y="732" width="288" height="48" />
      </svg>
    </div>,
    {
      ...size,
    }
  )
}
