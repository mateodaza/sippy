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
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Grid overlay effect */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(to right, rgba(0,175,215,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,175,215,0.06) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Outer border frame */}
      <div
        style={{
          position: 'absolute',
          inset: 20,
          border: '1px solid rgba(0,175,215,0.3)',
          borderRadius: 16,
        }}
      />
      {/* Inner border frame */}
      <div
        style={{
          position: 'absolute',
          inset: 28,
          border: '1px solid rgba(0,175,215,0.2)',
          borderRadius: 12,
        }}
      />

      {/* Sippy wordmark — using text since we can't load SVG easily */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 24,
        }}
      >
        {/* Brand name */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 700,
            color: '#00AFD7',
            letterSpacing: '0.15em',
            textTransform: 'uppercase' as const,
            fontFamily: 'system-ui',
          }}
        >
          SIPPY
        </div>

        {/* Tagline */}
        <div
          style={{
            fontSize: 32,
            fontWeight: 600,
            color: '#ffffff',
            letterSpacing: '0.02em',
            fontFamily: 'system-ui',
          }}
        >
          Send Dollars via WhatsApp
        </div>

        {/* Spec labels */}
        <div
          style={{
            display: 'flex',
            gap: 32,
            marginTop: 16,
          }}
        >
          {['ARBITRUM ONE', 'USDC', 'NON-CUSTODIAL', 'AI AGENT'].map((label) => (
            <div
              key={label}
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: 'rgba(0,175,215,0.7)',
                letterSpacing: '0.2em',
                fontFamily: 'monospace',
                border: '1px solid rgba(0,175,215,0.25)',
                padding: '6px 14px',
              }}
            >
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom spec strip */}
      <div
        style={{
          position: 'absolute',
          bottom: 36,
          left: 40,
          right: 40,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: 'rgba(0,175,215,0.4)',
            letterSpacing: '0.2em',
            fontFamily: 'monospace',
          }}
        >
          SIPPY.LAT
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#00D796',
              boxShadow: '0 0 6px rgba(0,215,150,0.5)',
            }}
          />
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: 'rgba(0,175,215,0.4)',
              letterSpacing: '0.2em',
              fontFamily: 'monospace',
            }}
          >
            LIVE // LATAM
          </div>
        </div>
      </div>
    </div>,
    {
      ...size,
    }
  )
}
