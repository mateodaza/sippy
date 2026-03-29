import { ImageResponse } from 'next/og'

export const size = { width: 180, height: 180 }
export const contentType = 'image/png'

export default function AppleIcon() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        background: '#00AFD7',
        borderRadius: 40,
      }}
    >
      {/* S/5 mark in white */}
      <svg width="80" height="90" viewBox="368 220 288 560" style={{ display: 'flex' }}>
        <rect fill="#FFFFFF" x="368" y="220" width="288" height="48" />
        <rect fill="#FFFFFF" x="368" y="316" width="288" height="48" />
        <rect fill="#FFFFFF" x="608" y="412" width="48" height="368" />
        <rect fill="#FFFFFF" x="368" y="732" width="288" height="48" />
      </svg>
    </div>,
    { ...size }
  )
}
