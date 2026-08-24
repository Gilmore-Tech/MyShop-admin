import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export { useDateRange } from '@/components/common/date-range-filter'
export type { DateRangePreset } from '@/lib/date-range'

/** Page-size dropdown ("10 / page", ...). */
export function PageSizeSelect({
  value, onChange, options = [10, 15, 20, 25, 50],
}: {
  value: number; onChange: (n: number) => void; options?: number[]
}) {
  return (
    <Select value={String(value)} onValueChange={v => onChange(Number(v))}>
      <SelectTrigger className="w-[120px] bg-white"><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map(o => (
          <SelectItem key={o} value={String(o)}>{o} / page</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
