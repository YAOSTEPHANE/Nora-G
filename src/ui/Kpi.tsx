'use client'

import { useEffect, useState, type ReactNode } from 'react'
import {
  Area,
  AreaChart,
  ResponsiveContainer,
} from 'recharts'
import { cn } from './cn'
import { IconArrowDownRight, IconArrowUpRight } from './icons'

export type KpiTone = 'neutral' | 'accent' | 'violet' | 'amber' | 'sky' | 'rose'

const SPARK_COLOR: Record<KpiTone, string> = {
  neutral: '#5f6f8d',
  accent: '#0033aa',
  violet: '#7452d8',
  amber: '#c98613',
  sky: '#2a86d4',
  rose: '#d84b7a',
}

const TONE_BAR: Record<KpiTone, string> = {
  neutral: 'bg-[#5f6f8d]',
  accent: 'bg-[#0033aa]',
  violet: 'bg-[#7452d8]',
  amber: 'bg-[#c98613]',
  sky: 'bg-[#2a86d4]',
  rose: 'bg-[#d84b7a]',
}

const TONE_ICON: Record<KpiTone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  accent: 'bg-[#e8eefa] text-[#0033aa]',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
  sky: 'bg-sky-50 text-sky-700',
  rose: 'bg-rose-50 text-rose-700',
}

export function Kpi({
  label,
  value,
  hint,
  delta,
  deltaPositive,
  spark,
  tone = 'neutral',
  className,
  icon,
}: {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  delta?: ReactNode
  deltaPositive?: boolean
  spark?: number[]
  tone?: KpiTone
  className?: string
  icon?: ReactNode
}) {
  const sparkData = spark?.map((v, i) => ({ i, v })) ?? []
  const sparkColor = SPARK_COLOR[tone]
  const gradId = `kpi-spark-${tone}`
  // Recharts mesure le parent au 1er paint ; sans layout → width/height -1 en console.
  const [chartReady, setChartReady] = useState(false)
  useEffect(() => {
    if (sparkData.length < 2) return
    const id = requestAnimationFrame(() => setChartReady(true))
    return () => cancelAnimationFrame(id)
  }, [sparkData.length])

  return (
    <div
      className={cn(
        'ui-card relative overflow-hidden p-4 sm:p-5 before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-br before:from-white/70 before:to-transparent',
        className,
      )}
    >
      <span
        className={cn(
          'absolute bottom-4 left-0 top-4 w-0.5 rounded-full',
          TONE_BAR[tone],
        )}
        aria-hidden
      />
      <div className="flex items-start justify-between gap-3">
        <p className="ui-eyebrow">{label}</p>
        {icon ? (
          <span
            className={cn(
              'flex h-8 w-8 items-center justify-center rounded-xl [&_svg]:h-3.5 [&_svg]:w-3.5',
              TONE_ICON[tone],
            )}
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="mt-2.5 truncate font-mono-nums text-[22px] font-semibold tracking-tight text-ink sm:text-[24px]">
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-[12px]">
        {delta ? (
          <span
            className={cn(
              'inline-flex items-center gap-0.5 font-semibold',
              deltaPositive === undefined
                ? 'text-ink-subtle'
                : deltaPositive
                  ? 'text-emerald-700'
                  : 'text-rose-600',
            )}
          >
            {deltaPositive === undefined ? null : deltaPositive ? (
              <IconArrowUpRight className="h-3 w-3" />
            ) : (
              <IconArrowDownRight className="h-3 w-3" />
            )}
            {delta}
          </span>
        ) : null}
        {hint ? <span className="text-ink-subtle">{hint}</span> : null}
      </div>

      {sparkData.length > 1 ? (
        <div className="mt-3 h-9 w-full min-w-0">
          {chartReady ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={36}>
              <AreaChart
                data={sparkData}
                margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={sparkColor} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={sparkColor} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke={sparkColor}
                  strokeWidth={1.5}
                  fill={`url(#${gradId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
