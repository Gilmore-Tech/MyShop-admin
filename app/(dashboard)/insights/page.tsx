import { redirect } from 'next/navigation'

// The Reports group's landing path.
export default function ReportsGroupRedirect() {
  redirect('/insights/revenue')
}
