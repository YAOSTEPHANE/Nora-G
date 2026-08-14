'use client'

import { useEffect, useState } from 'react'
import { BRAND_LOGO_SRC, BRAND_NAME } from '../brand'
import { useSiteBranding } from '../context/SiteBrandingContext'
import { cn } from '../ui/cn'

const SIZES = {
  xs: 'h-9 w-16',
  sm: 'h-10 w-20',
  md: 'h-12 w-24',
  lg: 'h-16 w-32',
  xl: 'h-20 w-40',
} as const

type BrandLogoSize = keyof typeof SIZES

type BrandLogoProps = {
  size?: BrandLogoSize
  alt?: string
  className?: string
  ring?: 'light' | 'dark' | 'subtle' | 'gold' | false
  /** Force une URL (ex. aperçu admin) au lieu du branding global. */
  src?: string
}

export function BrandLogo({
  size = 'md',
  alt,
  className,
  ring = 'subtle',
  src,
}: BrandLogoProps) {
  const { logoSrc, brandName } = useSiteBranding()
  const preferredSrc = src?.trim() || logoSrc
  const [resolvedSrc, setResolvedSrc] = useState(preferredSrc || BRAND_LOGO_SRC)
  const resolvedAlt = alt ?? (brandName || BRAND_NAME)

  useEffect(() => {
    setResolvedSrc(preferredSrc || BRAND_LOGO_SRC)
  }, [preferredSrc])

  return (
    <img
      key={resolvedSrc}
      src={resolvedSrc}
      alt={resolvedAlt}
      onError={() => {
        if (resolvedSrc !== BRAND_LOGO_SRC) {
          setResolvedSrc(BRAND_LOGO_SRC)
        }
      }}
      className={cn(
        'shrink-0 object-contain bg-white p-0.5',
        SIZES[size],
        'rounded-xl',
        ring === 'light' && 'border border-white/25 bg-white shadow-sm',
        ring === 'dark' && 'border border-white/15 bg-white/95',
        ring === 'subtle' && 'border border-zinc-200/90 bg-white',
        ring === 'gold' && 'border border-[#0033aa]/25 bg-white ring-1 ring-[#0033aa]/20',
        ring === false && 'border-0',
        className,
      )}
    />
  )
}
