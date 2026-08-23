/**
 * Fixed categorical order for the Insights charts. Validated with the dataviz
 * palette checker (lightness band, chroma floor, CVD separation, 3:1 contrast)
 * in light and dark mode: `#C27D12,#2F6FAD,#7C3AED,#0D9488`.
 *
 * Assign by entity, in this order, never by rank — a series keeps its colour
 * when a filter removes its neighbours. Text never wears a series colour.
 */
export const CHART_SERIES = ['#C27D12', '#2F6FAD', '#7C3AED', '#0D9488'] as const

export const CHART_GRID = '#F3F4F6'
export const CHART_AXIS_TEXT = '#9CA3AF'
export const CHART_TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8 } as const

/** Revenue stack (gross = net + promo + relief). */
export const REVENUE_SERIES = {
  net: CHART_SERIES[0],
  promo: CHART_SERIES[1],
  relief: CHART_SERIES[2],
} as const

/** Booking outcomes stack (requested = completed + cancelled + unassigned + active). */
export const OUTCOME_SERIES = {
  completed: CHART_SERIES[0],
  cancelled: CHART_SERIES[1],
  unassigned: CHART_SERIES[2],
  active: CHART_SERIES[3],
} as const
