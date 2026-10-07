import AppSidebar from '@/components/app-sidebar'
import Header from '@/components/Header'
import AuthGuard from '@/components/auth-guard'
import { RouteLoading } from '@/components/common/route-loading'
import { AdminRegionScopeProvider } from '@/components/admin/admin-region-scope'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AdminRegionScopeProvider>
        <RouteLoading />
        <div className="flex h-full w-full overflow-hidden bg-background">
          <AppSidebar />
          <div className="flex flex-col flex-1 overflow-hidden">
            <Header />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </AdminRegionScopeProvider>
    </AuthGuard>
  )
}
