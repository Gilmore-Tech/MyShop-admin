'use client'

import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useRole } from '@/hooks/use-role'

/**
 * The User Management tab strip. A category-scoped coordinator only sees their
 * vertical's provider tab (rides → Drivers, artisan → Artisans) and is
 * redirected away from the other type's page. RM/global see both.
 */
export function UserTabs({ active }: { active: 'clients' | 'drivers' | 'artisans' }) {
  const { category } = useRole()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (category === 'rides' && pathname === '/users/artisans') router.replace('/users/drivers')
    if (category === 'artisan' && pathname === '/users/drivers') router.replace('/users/artisans')
  }, [category, pathname, router])

  const showDrivers = !category || category === 'rides'
  const showArtisans = !category || category === 'artisan'

  return (
    <Tabs value={active} className="mb-6">
      <TabsList className="bg-white">
        <TabsTrigger value="clients" asChild><Link href="/users/clients">Clients</Link></TabsTrigger>
        {showDrivers && <TabsTrigger value="drivers" asChild><Link href="/users/drivers">Drivers</Link></TabsTrigger>}
        {showArtisans && <TabsTrigger value="artisans" asChild><Link href="/users/artisans">Artisans</Link></TabsTrigger>}
      </TabsList>
    </Tabs>
  )
}
