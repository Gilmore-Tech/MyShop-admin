import AppSidebar from '@/components/app-sidebar'
import Header from '@/components/Header'
import AuthGuard from '@/components/auth-guard'
import { RouteLoading } from '@/components/common/route-loading'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
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
    </AuthGuard>
  )
}
