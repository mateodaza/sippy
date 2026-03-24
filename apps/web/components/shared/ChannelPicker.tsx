'use client'

import { useState } from 'react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type Channel = 'sms' | 'whatsapp'
type Lang = 'en' | 'es' | 'pt'
type BrandColor = 'primary' | 'crypto'

export interface ChannelPickerProps {
  canSwitch: boolean
  isLoading: boolean
  disabled: boolean
  lang: Lang
  onSend: (channel: Channel) => void
  brandColor?: BrandColor
}

export interface ResendButtonProps {
  channel: Channel
  isLoading: boolean
  lang: Lang
  onResend: () => void
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const RESEND_LABELS: Record<Lang, string> = {
  en: 'Resend code',
  es: 'Reenviar codigo',
  pt: 'Reenviar codigo',
}

const smsBrandClasses: Record<BrandColor, string> = {
  primary: 'bg-brand-primary hover:bg-brand-primary-hover',
  crypto: 'bg-brand-crypto hover:bg-brand-crypto/90',
}

const WA_CLASSES = 'bg-[#25D366] hover:bg-[#20bd5a]'
const SHARED_CLASSES =
  'text-white py-3 rounded-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed'

/* ------------------------------------------------------------------ */
/*  ChannelPicker                                                      */
/* ------------------------------------------------------------------ */

export function ChannelPicker({
  canSwitch,
  isLoading,
  disabled,
  lang,
  onSend,
  brandColor = 'primary',
}: ChannelPickerProps) {
  const [clicked, setClicked] = useState<Channel | null>(null)

  const handleClick = (ch: Channel) => {
    setClicked(ch)
    onSend(ch)
  }

  const smsLabel = isLoading && clicked === 'sms' ? 'SMS...' : 'SMS'
  const waLabel = isLoading && clicked === 'whatsapp' ? 'WhatsApp...' : 'WhatsApp'

  if (canSwitch) {
    return (
      <div className="flex gap-3">
        <button
          onClick={() => handleClick('sms')}
          disabled={disabled || isLoading}
          className={`flex-1 ${smsBrandClasses[brandColor]} ${SHARED_CLASSES} text-sm`}
        >
          {smsLabel}
        </button>
        <button
          onClick={() => handleClick('whatsapp')}
          disabled={disabled || isLoading}
          className={`flex-1 ${WA_CLASSES} ${SHARED_CLASSES} text-sm`}
        >
          {waLabel}
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => handleClick('whatsapp')}
      disabled={disabled || isLoading}
      className={`w-full ${WA_CLASSES} ${SHARED_CLASSES}`}
    >
      {waLabel}
    </button>
  )
}

/* ------------------------------------------------------------------ */
/*  ResendButton                                                       */
/* ------------------------------------------------------------------ */

export function ResendButton({ channel, isLoading, lang, onResend }: ResendButtonProps) {
  return (
    <button
      onClick={onResend}
      disabled={isLoading}
      className="w-full mt-3 text-sm text-brand-primary hover:text-brand-primary-hover py-2"
    >
      {RESEND_LABELS[lang]}
    </button>
  )
}
