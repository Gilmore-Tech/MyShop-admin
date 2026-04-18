import type { Metadata } from 'next'
import { Raleway, Roboto } from 'next/font/google'
import './globals.css'

const raleway = Raleway({
  variable: '--font-raleway',
  subsets: ['latin'],
  display: 'swap',
})

const roboto = Roboto({
  variable: '--font-roboto',
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MyShop Admin Dashboard',
  description: 'Admin dashboard for the MyShop platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${raleway.variable} ${roboto.variable} antialiased`}>
        {children}
      </body>
    </html>
  )
}
// The layout component is used to wrap all pages and can include shared components like headers, footers, or sidebars. In this case, we will just render the children directly, but you can easily add a header or sidebar here if needed.