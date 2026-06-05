// ─── Formatters ──────────────────────────────────────────────────────────────

export function formatGhs(pesewas: number) {
  return `GHS ${(pesewas / 100).toFixed(2)}`
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: 'GMT',
  })
}

// ─── KPI Data ─────────────────────────────────────────────────────────────────

export const kpiData = {
  activeRides: 14,
  activeJobs: 8,
  pendingVerifications: 23,
  openDisputes: 5,
  todayRevenuePesewas: 284600,
  onlineProviders: 47,
}

// ─── Revenue Trend (last 30 days) ─────────────────────────────────────────────

export const revenueTrend = Array.from({ length: 30 }, (_, i) => {
  const date = new Date('2026-03-14')
  date.setDate(date.getDate() + i)
  return {
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    rides: Math.floor(Math.random() * 80000 + 30000),
    artisan: Math.floor(Math.random() * 60000 + 20000),
  }
})

// ─── Weekly Bookings ──────────────────────────────────────────────────────────

export const weeklyBookings = [
  { day: 'Mon', rides: 42, artisan: 18 },
  { day: 'Tue', rides: 55, artisan: 22 },
  { day: 'Wed', rides: 38, artisan: 30 },
  { day: 'Thu', rides: 61, artisan: 15 },
  { day: 'Fri', rides: 74, artisan: 27 },
  { day: 'Sat', rides: 89, artisan: 41 },
  { day: 'Sun', rides: 67, artisan: 35 },
]

// ─── User Growth ──────────────────────────────────────────────────────────────

export const userGrowth = Array.from({ length: 30 }, (_, i) => {
  const date = new Date('2026-03-14')
  date.setDate(date.getDate() + i)
  return {
    date: date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
    clients: 80 + i * 12 + Math.floor(Math.random() * 10),
    drivers: 20 + i * 4 + Math.floor(Math.random() * 3),
    artisans: 30 + i * 5 + Math.floor(Math.random() * 4),
  }
})

// ─── Activity Feed ─────────────────────────────────────────────────────────────

export const activityFeed = [
  { id: '1', type: 'dispute', text: 'Kofi Acheampong raised a fare dispute on ride #RD-9821', time: '2 minutes ago', href: '/disputes' },
  { id: '2', type: 'verification', text: 'Abena Mensah submitted driver verification documents', time: '8 minutes ago', href: '/verifications' },
  { id: '3', type: 'ride', text: 'Ride #RD-9820 completed — GHS 32.00 — Adum → Kejetia', time: '12 minutes ago', href: '/rides' },
  { id: '4', type: 'registration', text: 'New client registered: Ama Owusu (+233 24 701 4422)', time: '15 minutes ago', href: '/users/clients' },
  { id: '5', type: 'job', text: 'Artisan job #AJ-4421 completed — Electrician — GHS 120.00', time: '22 minutes ago', href: '/artisan-jobs' },
  { id: '6', type: 'verification', text: 'Kwame Asante submitted artisan verification — Plumber', time: '31 minutes ago', href: '/verifications' },
  { id: '7', type: 'dispute', text: 'Client Akosua Darko escalated dispute #DS-0318 to Ops Admin', time: '45 minutes ago', href: '/disputes' },
  { id: '8', type: 'ride', text: 'Ride #RD-9819 completed — GHS 18.00 — Asokwa → Bantama', time: '52 minutes ago', href: '/rides' },
  { id: '9', type: 'registration', text: 'New artisan registered: Emmanuel Asare — Carpenter', time: '1 hour ago', href: '/users/artisans' },
  { id: '10', type: 'job', text: 'Artisan job #AJ-4420 — Plumber — escalated after 24h inactivity', time: '1 hour ago', href: '/artisan-jobs' },
  { id: '11', type: 'ride', text: 'Ride #RD-9818 completed — GHS 45.00 — KNUST → Airport', time: '2 hours ago', href: '/rides' },
  { id: '12', type: 'verification', text: 'Yaw Boateng driver verification approved by Kwadwo Admin', time: '2 hours ago', href: '/verifications' },
]

// ─── Users ────────────────────────────────────────────────────────────────────

export type UserStatus = 'active' | 'suspended' | 'banned' | 'pending_verification'

export const clients = [
  { id: 'U001', name: 'Ama Owusu', phone: '+233 24 701 4422', email: 'ama.owusu@gmail.com', registeredAt: '2026-01-14', status: 'active' as UserStatus, totalBookings: 34, loyaltyPoints: 1240, paymentMethod: 'MTN MoMo', idVerified: true },
  { id: 'U002', name: 'Kweku Mensah', phone: '+233 55 312 8801', email: 'kweku.m@yahoo.com', registeredAt: '2026-01-22', status: 'active' as UserStatus, totalBookings: 12, loyaltyPoints: 480, paymentMethod: 'Visa Card', idVerified: false },
  { id: 'U003', name: 'Akosua Darko', phone: '+233 27 501 3392', email: 'akosua.d@outlook.com', registeredAt: '2026-02-03', status: 'active' as UserStatus, totalBookings: 7, loyaltyPoints: 260, paymentMethod: 'Telecel Cash', idVerified: true },
  { id: 'U004', name: 'Kofi Acheampong', phone: '+233 24 819 5521', email: 'kofi.a@gmail.com', registeredAt: '2026-02-11', status: 'suspended' as UserStatus, totalBookings: 28, loyaltyPoints: 980, paymentMethod: 'MTN MoMo', idVerified: true },
  { id: 'U005', name: 'Abena Asante', phone: '+233 50 672 1143', email: 'abena.a@gmail.com', registeredAt: '2026-02-18', status: 'active' as UserStatus, totalBookings: 5, loyaltyPoints: 180, paymentMethod: 'AirtelTigo', idVerified: false },
  { id: 'U006', name: 'Yaw Boateng', phone: '+233 24 334 7762', email: 'yaw.b@gmail.com', registeredAt: '2026-02-25', status: 'active' as UserStatus, totalBookings: 19, loyaltyPoints: 720, paymentMethod: 'MTN MoMo', idVerified: true },
  { id: 'U007', name: 'Adwoa Ofori', phone: '+233 55 901 2234', email: 'adwoa.o@gmail.com', registeredAt: '2026-03-01', status: 'banned' as UserStatus, totalBookings: 3, loyaltyPoints: 80, paymentMethod: 'Visa Card', idVerified: false },
  { id: 'U008', name: 'Kwabena Frimpong', phone: '+233 27 441 8890', email: 'kwabena.f@gmail.com', registeredAt: '2026-03-08', status: 'active' as UserStatus, totalBookings: 2, loyaltyPoints: 60, paymentMethod: 'MTN MoMo', idVerified: false },
]

export const drivers = [
  { id: 'D001', name: 'Kwame Asante', phone: '+233 24 881 2234', email: 'kwame.a@gmail.com', registeredAt: '2026-01-10', status: 'active' as UserStatus, totalRides: 128, avgRating: 4.7, cancellationRate: 2.3, onlineHours: 42, earningsPesewas: 384000, vehicle: 'Toyota Corolla 2018 · GR-2341-19' },
  { id: 'D002', name: 'Yaw Osei', phone: '+233 55 442 9981', email: 'yaw.o@gmail.com', registeredAt: '2026-01-18', status: 'active' as UserStatus, totalRides: 94, avgRating: 4.5, cancellationRate: 4.1, onlineHours: 35, earningsPesewas: 281200, vehicle: 'Hyundai Accent 2020 · AK-1182-20' },
  { id: 'D003', name: 'Fiifi Mensah', phone: '+233 27 301 4421', email: 'fiifi.m@gmail.com', registeredAt: '2026-01-25', status: 'active' as UserStatus, totalRides: 67, avgRating: 4.8, cancellationRate: 1.5, onlineHours: 28, earningsPesewas: 198400, vehicle: 'Kia Cerato 2019 · AS-5561-20' },
  { id: 'D004', name: 'Kofi Boateng', phone: '+233 24 551 6673', email: 'kofi.b@gmail.com', registeredAt: '2026-02-05', status: 'suspended' as UserStatus, totalRides: 31, avgRating: 2.9, cancellationRate: 18.0, onlineHours: 12, earningsPesewas: 88800, vehicle: 'Nissan Sentra 2017 · BA-9001-18' },
  { id: 'D005', name: 'Ato Acheampong', phone: '+233 50 771 2290', email: 'ato.a@gmail.com', registeredAt: '2026-02-14', status: 'active' as UserStatus, totalRides: 52, avgRating: 4.6, cancellationRate: 3.8, onlineHours: 30, earningsPesewas: 155200, vehicle: 'Toyota Camry 2016 · KS-3341-17' },
  { id: 'D006', name: 'Nana Osei Bonsu', phone: '+233 24 661 3341', email: 'nana.ob@gmail.com', registeredAt: '2026-02-22', status: 'active' as UserStatus, totalRides: 19, avgRating: 4.4, cancellationRate: 5.3, onlineHours: 18, earningsPesewas: 56400, vehicle: 'Honda Civic 2021 · GT-7721-22' },
]

export const artisans = [
  { id: 'A001', name: 'Abena Mensah', phone: '+233 24 701 8821', email: 'abena.m@gmail.com', registeredAt: '2026-01-08', status: 'active' as UserStatus, totalJobs: 87, avgRating: 4.9, categories: ['Electrician'], radius: 15, capacity: 'solo', supplementRate: 12, earningsPesewas: 524000 },
  { id: 'A002', name: 'Emmanuel Asare', phone: '+233 55 332 1109', email: 'emma.a@gmail.com', registeredAt: '2026-01-15', status: 'active' as UserStatus, totalJobs: 61, avgRating: 4.6, categories: ['Carpenter', 'Masonry'], radius: 10, capacity: 'multi', supplementRate: 28, earningsPesewas: 365200 },
  { id: 'A003', name: 'Kwabena Osei', phone: '+233 27 881 5543', email: 'kwabena.o@gmail.com', registeredAt: '2026-01-21', status: 'active' as UserStatus, totalJobs: 44, avgRating: 4.4, categories: ['Plumber'], radius: 8, capacity: 'solo', supplementRate: 9, earningsPesewas: 261600 },
  { id: 'A004', name: 'Akua Frimpong', phone: '+233 24 441 7730', email: 'akua.f@gmail.com', registeredAt: '2026-02-01', status: 'active' as UserStatus, totalJobs: 29, avgRating: 4.7, categories: ['Seamstress'], radius: 5, capacity: 'solo', supplementRate: 6, earningsPesewas: 172000 },
  { id: 'A005', name: 'Yaw Darko', phone: '+233 50 561 9902', email: 'yaw.d@gmail.com', registeredAt: '2026-02-10', status: 'suspended' as UserStatus, totalJobs: 18, avgRating: 2.8, categories: ['Mechanic'], radius: 20, capacity: 'multi', supplementRate: 44, earningsPesewas: 104800 },
  { id: 'A006', name: 'Adjoa Boateng', phone: '+233 24 991 3381', email: 'adjoa.b@gmail.com', registeredAt: '2026-02-20', status: 'active' as UserStatus, totalJobs: 12, avgRating: 4.8, categories: ['Painter'], radius: 12, capacity: 'solo', supplementRate: 8, earningsPesewas: 72000 },
]

// ─── Verifications ─────────────────────────────────────────────────────────────

export type VerificationStatus = 'pending' | 'under_review' | 'approved' | 'rejected'

export const verifications = [
  { id: 'V001', submittedAt: '2026-04-13T08:14:00Z', providerName: 'Kwame Boateng', role: 'driver' as const, phone: '+233 24 881 4421', status: 'pending' as VerificationStatus, reviewer: null },
  { id: 'V002', submittedAt: '2026-04-13T07:52:00Z', providerName: 'Esi Ansah', role: 'artisan' as const, phone: '+233 55 772 3301', status: 'under_review' as VerificationStatus, reviewer: 'Kwadwo Admin' },
  { id: 'V003', submittedAt: '2026-04-13T07:30:00Z', providerName: 'Prince Ofori', role: 'driver' as const, phone: '+233 27 441 8892', status: 'pending' as VerificationStatus, reviewer: null },
  { id: 'V004', submittedAt: '2026-04-12T16:45:00Z', providerName: 'Afia Twum', role: 'artisan' as const, phone: '+233 24 661 2210', status: 'under_review' as VerificationStatus, reviewer: 'Akosua Admin' },
  { id: 'V005', submittedAt: '2026-04-12T14:20:00Z', providerName: 'Daniel Asante', role: 'driver' as const, phone: '+233 50 891 4432', status: 'approved' as VerificationStatus, reviewer: 'Kwadwo Admin' },
  { id: 'V006', submittedAt: '2026-04-12T11:00:00Z', providerName: 'Patience Yeboah', role: 'artisan' as const, phone: '+233 24 551 7701', status: 'rejected' as VerificationStatus, reviewer: 'Akosua Admin' },
  { id: 'V007', submittedAt: '2026-04-11T18:30:00Z', providerName: 'Isaac Amponsah', role: 'driver' as const, phone: '+233 27 771 5543', status: 'pending' as VerificationStatus, reviewer: null },
  { id: 'V008', submittedAt: '2026-04-11T15:10:00Z', providerName: 'Cecilia Owusu', role: 'artisan' as const, phone: '+233 55 441 9921', status: 'pending' as VerificationStatus, reviewer: null },
]

// ─── Rides ─────────────────────────────────────────────────────────────────────

export type RideStatus = 'requested' | 'accepted' | 'en_route' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'
export type PaymentStatus = 'paid' | 'pending' | 'disputed' | 'refunded'

export const rides = [
  { id: 'RD-9821', dateTime: '2026-04-13T09:01:00Z', client: 'Kofi Acheampong', driver: 'Kwame Asante', pickup: 'Adum, Kumasi', dropoff: 'Kejetia Market', status: 'disputed' as RideStatus, farePesewas: 2800, paymentMethod: 'MTN MoMo', paymentStatus: 'disputed' as PaymentStatus },
  { id: 'RD-9820', dateTime: '2026-04-13T08:45:00Z', client: 'Ama Owusu', driver: 'Yaw Osei', pickup: 'Asokwa', dropoff: 'Bantama', status: 'completed' as RideStatus, farePesewas: 3200, paymentMethod: 'MTN MoMo', paymentStatus: 'paid' as PaymentStatus },
  { id: 'RD-9819', dateTime: '2026-04-13T08:22:00Z', client: 'Akosua Darko', driver: 'Fiifi Mensah', pickup: 'Asokwa', dropoff: 'Bantama', status: 'completed' as RideStatus, farePesewas: 1800, paymentMethod: 'Visa Card', paymentStatus: 'paid' as PaymentStatus },
  { id: 'RD-9818', dateTime: '2026-04-13T07:50:00Z', client: 'Yaw Boateng', driver: 'Kwame Asante', pickup: 'KNUST', dropoff: 'Airport', status: 'completed' as RideStatus, farePesewas: 4500, paymentMethod: 'MTN MoMo', paymentStatus: 'paid' as PaymentStatus },
  { id: 'RD-9817', dateTime: '2026-04-13T07:30:00Z', client: 'Kweku Mensah', driver: 'Ato Acheampong', pickup: 'Manhyia', dropoff: 'Suame', status: 'completed' as RideStatus, farePesewas: 2200, paymentMethod: 'AirtelTigo', paymentStatus: 'paid' as PaymentStatus },
  { id: 'RD-9816', dateTime: '2026-04-13T07:10:00Z', client: 'Abena Asante', driver: 'Nana Osei Bonsu', pickup: 'Patasi', dropoff: 'Adum', status: 'cancelled' as RideStatus, farePesewas: 0, paymentMethod: 'MTN MoMo', paymentStatus: 'refunded' as PaymentStatus },
  { id: 'RD-9815', dateTime: '2026-04-13T06:55:00Z', client: 'Adwoa Ofori', driver: 'Yaw Osei', pickup: 'Dichemso', dropoff: 'Kejetia', status: 'completed' as RideStatus, farePesewas: 1500, paymentMethod: 'Telecel Cash', paymentStatus: 'paid' as PaymentStatus },
  { id: 'RD-9814', dateTime: '2026-04-12T22:10:00Z', client: 'Kwabena Frimpong', driver: 'Kwame Asante', pickup: 'KNUST', dropoff: 'Ahodwo', status: 'completed' as RideStatus, farePesewas: 3800, paymentMethod: 'MTN MoMo', paymentStatus: 'paid' as PaymentStatus },
]

// ─── Artisan Jobs ─────────────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'open_for_bids' | 'bids_received' | 'confirmed' | 'en_route' | 'arrived' | 'in_progress' | 'completed' | 'cancelled' | 'disputed'

export const artisanJobs = [
  { id: 'AJ-4421', dateTime: '2026-04-13T08:30:00Z', client: 'Ama Owusu', artisan: 'Abena Mensah', category: 'Electrician', status: 'completed' as JobStatus, agreedPricePesewas: 12000, supplementPesewas: 2500, paymentStatus: 'paid' as PaymentStatus, staleHours: 0 },
  { id: 'AJ-4420', dateTime: '2026-04-12T10:15:00Z', client: 'Yaw Boateng', artisan: 'Kwabena Osei', category: 'Plumber', status: 'in_progress' as JobStatus, agreedPricePesewas: 8000, supplementPesewas: 0, paymentStatus: 'pending' as PaymentStatus, staleHours: 26 },
  { id: 'AJ-4419', dateTime: '2026-04-13T07:00:00Z', client: 'Kofi Acheampong', artisan: 'Emmanuel Asare', category: 'Carpenter', status: 'arrived' as JobStatus, agreedPricePesewas: 15000, supplementPesewas: 4000, paymentStatus: 'pending' as PaymentStatus, staleHours: 0 },
  { id: 'AJ-4418', dateTime: '2026-04-13T06:45:00Z', client: 'Akosua Darko', artisan: 'Unassigned', category: 'Mechanic', status: 'queued' as JobStatus, agreedPricePesewas: 0, supplementPesewas: 0, paymentStatus: 'pending' as PaymentStatus, staleHours: 0 },
  { id: 'AJ-4417', dateTime: '2026-04-12T14:00:00Z', client: 'Kweku Mensah', artisan: 'Akua Frimpong', category: 'Seamstress', status: 'completed' as JobStatus, agreedPricePesewas: 9500, supplementPesewas: 0, paymentStatus: 'paid' as PaymentStatus, staleHours: 0 },
  { id: 'AJ-4416', dateTime: '2026-04-13T09:30:00Z', client: 'Abena Asante', artisan: 'Adjoa Boateng', category: 'Painter', status: 'en_route' as JobStatus, agreedPricePesewas: 20000, supplementPesewas: 0, paymentStatus: 'pending' as PaymentStatus, staleHours: 0 },
  { id: 'AJ-4415', dateTime: '2026-04-12T11:30:00Z', client: 'Adwoa Ofori', artisan: 'Emmanuel Asare', category: 'Masonry', status: 'disputed' as JobStatus, agreedPricePesewas: 35000, supplementPesewas: 8000, paymentStatus: 'disputed' as PaymentStatus, staleHours: 0 },
]

// ─── Disputes ─────────────────────────────────────────────────────────────────

export type DisputeStatus = 'open' | 'under_review' | 'resolved_refunded' | 'resolved_rejected' | 'escalated'

export const disputes = [
  { id: 'DS-0321', raisedAt: '2026-04-13T09:05:00Z', type: 'ride' as const, bookingId: 'RD-9821', raisedBy: 'client' as const, reason: 'Driver took a longer route', amountPesewas: 2800, status: 'open' as DisputeStatus, assignee: null, resolvedAt: null },
  { id: 'DS-0320', raisedAt: '2026-04-12T16:20:00Z', type: 'job' as const, bookingId: 'AJ-4415', raisedBy: 'client' as const, reason: 'Work quality did not match description', amountPesewas: 35000, status: 'under_review' as DisputeStatus, assignee: 'Akosua Admin', resolvedAt: null },
  { id: 'DS-0319', raisedAt: '2026-04-12T11:40:00Z', type: 'ride' as const, bookingId: 'RD-9810', raisedBy: 'client' as const, reason: 'Overcharged fare due to wrong route', amountPesewas: 1800, status: 'resolved_refunded' as DisputeStatus, assignee: 'Kwadwo Admin', resolvedAt: '2026-04-12T14:00:00Z' },
  { id: 'DS-0318', raisedAt: '2026-04-11T14:30:00Z', type: 'job' as const, bookingId: 'AJ-4400', raisedBy: 'provider' as const, reason: 'Client not confirming job completion for 6 hours', amountPesewas: 12000, status: 'escalated' as DisputeStatus, assignee: 'Super Admin', resolvedAt: null },
  { id: 'DS-0317', raisedAt: '2026-04-11T10:15:00Z', type: 'ride' as const, bookingId: 'RD-9801', raisedBy: 'client' as const, reason: 'Driver cancelled after 5 minutes', amountPesewas: 0, status: 'resolved_rejected' as DisputeStatus, assignee: 'Kwadwo Admin', resolvedAt: '2026-04-11T15:30:00Z' },
]

// ─── Transactions ─────────────────────────────────────────────────────────────

export type TxType = 'collection' | 'payout' | 'refund' | 'clawback' | 'tip'
export type TxStatus = 'completed' | 'pending' | 'failed' | 'retrying'

export const transactions = [
  { id: 'TX-88891', dateTime: '2026-04-13T09:01:00Z', type: 'collection' as TxType, amountPesewas: 2800, method: 'MTN MoMo', status: 'completed' as TxStatus, bookingId: 'RD-9821', party: 'Kofi Acheampong' },
  { id: 'TX-88890', dateTime: '2026-04-13T08:47:00Z', type: 'payout' as TxType, amountPesewas: 2240, method: 'MTN MoMo', status: 'completed' as TxStatus, bookingId: 'RD-9820', party: 'Yaw Osei' },
  { id: 'TX-88889', dateTime: '2026-04-13T08:45:00Z', type: 'collection' as TxType, amountPesewas: 3200, method: 'MTN MoMo', status: 'completed' as TxStatus, bookingId: 'RD-9820', party: 'Ama Owusu' },
  { id: 'TX-88888', dateTime: '2026-04-13T08:24:00Z', type: 'refund' as TxType, amountPesewas: 1500, method: 'Telecel Cash', status: 'completed' as TxStatus, bookingId: 'RD-9815', party: 'Adwoa Ofori' },
  { id: 'TX-88887', dateTime: '2026-04-13T07:55:00Z', type: 'payout' as TxType, amountPesewas: 3600, method: 'MTN MoMo', status: 'failed' as TxStatus, bookingId: 'RD-9818', party: 'Kwame Asante' },
  { id: 'TX-88886', dateTime: '2026-04-13T07:52:00Z', type: 'collection' as TxType, amountPesewas: 4500, method: 'MTN MoMo', status: 'completed' as TxStatus, bookingId: 'RD-9818', party: 'Yaw Boateng' },
  { id: 'TX-88885', dateTime: '2026-04-13T07:00:00Z', type: 'tip' as TxType, amountPesewas: 500, method: 'MTN MoMo', status: 'completed' as TxStatus, bookingId: 'RD-9817', party: 'Kweku Mensah' },
  { id: 'TX-88884', dateTime: '2026-04-12T18:00:00Z', type: 'payout' as TxType, amountPesewas: 9600, method: 'MTN MoMo', status: 'completed' as TxStatus, bookingId: 'AJ-4421', party: 'Abena Mensah' },
  { id: 'TX-88883', dateTime: '2026-04-12T18:00:00Z', type: 'clawback' as TxType, amountPesewas: 3200, method: 'MTN MoMo', status: 'retrying' as TxStatus, bookingId: 'DS-0319', party: 'Kofi Boateng' },
]

// ─── Batch Payouts ─────────────────────────────────────────────────────────────

export type BatchStatus = 'completed' | 'failed' | 'retrying' | 'partial'

export const batchPayouts = [
  { date: '2026-04-13', primaryRun: '18:00 GMT', status: 'pending' as BatchStatus, providers: 0, totalPesewas: 0, failureReason: null, retries: [] },
  { date: '2026-04-12', primaryRun: '18:00 GMT', status: 'completed' as BatchStatus, providers: 31, totalPesewas: 1284000, failureReason: null, retries: [] },
  { date: '2026-04-11', primaryRun: '18:00 GMT', status: 'partial' as BatchStatus, providers: 28, totalPesewas: 1042000, failureReason: '2 MoMo timeouts', retries: [{ time: '19:30 GMT', status: 'completed' }] },
  { date: '2026-04-10', primaryRun: '18:00 GMT', status: 'failed' as BatchStatus, providers: 0, totalPesewas: 0, failureReason: 'Flutterwave API unreachable', retries: [{ time: '19:30 GMT', status: 'failed' }, { time: '20:00 GMT', status: 'completed' }] },
  { date: '2026-04-09', primaryRun: '18:00 GMT', status: 'completed' as BatchStatus, providers: 35, totalPesewas: 1561000, failureReason: null, retries: [] },
]

// ─── Clawbacks ────────────────────────────────────────────────────────────────

export const clawbacks = [
  { providerId: 'D004', providerName: 'Kofi Boateng', outstandingPesewas: 3200, originalDisputeId: 'DS-0319', initiatedAt: '2026-04-12', daysOutstanding: 1 },
  { providerId: 'A005', providerName: 'Yaw Darko', outstandingPesewas: 15000, originalDisputeId: 'DS-0311', initiatedAt: '2026-03-15', daysOutstanding: 29 },
  { providerId: 'D006', providerName: 'Nana Osei Bonsu', outstandingPesewas: 800, originalDisputeId: 'DS-0298', initiatedAt: '2026-02-01', daysOutstanding: 71 },
  { providerId: 'A003', providerName: 'Kwabena Osei', outstandingPesewas: 4500, originalDisputeId: 'DS-0285', initiatedAt: '2026-01-20', daysOutstanding: 83 },
]

// ─── Admin Accounts ───────────────────────────────────────────────────────────

export type AdminRole = 'super_admin' | 'regional_admin' | 'ops_admin' | 'support_agent'
export type AdminStatus = 'active' | 'inactive'

export const adminAccounts = [
  { id: 'ADM001', name: 'Kwadwo Mensah', email: 'kwadwo@myshop.com.gh', role: 'super_admin' as AdminRole, status: 'active' as AdminStatus, lastLogin: '2026-04-13T09:00:00Z', createdAt: '2026-01-01' },
  { id: 'ADM002', name: 'Akosua Owusu', email: 'akosua@myshop.com.gh', role: 'regional_admin' as AdminRole, status: 'active' as AdminStatus, lastLogin: '2026-04-13T08:30:00Z', createdAt: '2026-01-05' },
  { id: 'ADM003', name: 'Fiifi Asante', email: 'fiifi@myshop.com.gh', role: 'ops_admin' as AdminRole, status: 'active' as AdminStatus, lastLogin: '2026-04-12T17:45:00Z', createdAt: '2026-01-10' },
  { id: 'ADM004', name: 'Ama Boateng', email: 'ama@myshop.com.gh', role: 'support_agent' as AdminRole, status: 'active' as AdminStatus, lastLogin: '2026-04-13T07:20:00Z', createdAt: '2026-01-15' },
  { id: 'ADM005', name: 'Kofi Frimpong', email: 'kofi@myshop.com.gh', role: 'support_agent' as AdminRole, status: 'inactive' as AdminStatus, lastLogin: '2026-03-20T11:00:00Z', createdAt: '2026-01-20' },
]

// ─── Audit Log ────────────────────────────────────────────────────────────────

export const auditLog = [
  { id: 'AL-001', adminName: 'Kwadwo Mensah', action: 'user.suspend', target: 'Kofi Acheampong (U004)', details: 'Suspended for fraudulent dispute claims', timestamp: '2026-04-13T08:55:00Z' },
  { id: 'AL-002', adminName: 'Akosua Owusu', action: 'verification.approve', target: 'Daniel Asante (V005)', details: 'All documents valid, KYC cleared', timestamp: '2026-04-12T16:30:00Z' },
  { id: 'AL-003', adminName: 'Akosua Owusu', action: 'verification.reject', target: 'Patience Yeboah (V006)', details: 'Trade certificate expired. Document not valid.', timestamp: '2026-04-12T13:10:00Z' },
  { id: 'AL-004', adminName: 'Ama Boateng', action: 'dispute.resolve', target: 'DS-0319', details: 'Full refund approved — GPS deviation exceeded 30%', timestamp: '2026-04-12T14:00:00Z' },
  { id: 'AL-005', adminName: 'Kwadwo Mensah', action: 'config.update', target: 'commission_rate_percent', details: 'Changed from 18 → 20', timestamp: '2026-04-10T10:00:00Z' },
  { id: 'AL-006', adminName: 'Fiifi Asante', action: 'announcement.broadcast', target: 'All Users', details: 'Easter holiday service notice', timestamp: '2026-04-09T09:00:00Z' },
]

// ─── USSD ─────────────────────────────────────────────────────────────────────

export const ussdStats = {
  totalRegistrations: 342,
  activeSessions: 3,
  bookingsToday: 18,
  bookingsWeek: 112,
  bookingsMonth: 387,
  completionRate: 78,
  topCategories: ['Mechanic', 'Plumber', 'Electrician', 'Carpenter'],
}

export const ussdSessions = [
  { id: 'US-001', phone: '+233 24 ***-4421', timestamp: '2026-04-13T09:10:00Z', flow: 'booking', outcome: 'completed', zone: 'Suame' },
  { id: 'US-002', phone: '+233 55 ***-9901', timestamp: '2026-04-13T09:05:00Z', flow: 'status_check', outcome: 'completed', zone: 'Asokwa' },
  { id: 'US-003', phone: '+233 27 ***-3341', timestamp: '2026-04-13T08:50:00Z', flow: 'booking', outcome: 'timeout', zone: 'Bantama' },
  { id: 'US-004', phone: '+233 24 ***-8812', timestamp: '2026-04-13T08:40:00Z', flow: 'payment', outcome: 'completed', zone: 'Adum' },
  { id: 'US-005', phone: '+233 50 ***-1122', timestamp: '2026-04-13T08:30:00Z', flow: 'registration', outcome: 'completed', zone: 'Manhyia' },
  { id: 'US-006', phone: '+233 24 ***-5531', timestamp: '2026-04-13T08:10:00Z', flow: 'cancel', outcome: 'error', zone: 'KNUST Area' },
]

export const ussdZones = [
  { id: 'Z01', name: 'Adum', active: true, bookingsThisMonth: 52 },
  { id: 'Z02', name: 'Asokwa', active: true, bookingsThisMonth: 38 },
  { id: 'Z03', name: 'Bantama', active: true, bookingsThisMonth: 45 },
  { id: 'Z04', name: 'Dichemso', active: true, bookingsThisMonth: 29 },
  { id: 'Z05', name: 'KNUST Area', active: true, bookingsThisMonth: 41 },
  { id: 'Z06', name: 'Kejetia', active: true, bookingsThisMonth: 33 },
  { id: 'Z07', name: 'Manhyia', active: true, bookingsThisMonth: 27 },
  { id: 'Z08', name: 'Patasi', active: true, bookingsThisMonth: 19 },
  { id: 'Z09', name: 'Suame', active: true, bookingsThisMonth: 44 },
  { id: 'Z10', name: 'Tafo', active: false, bookingsThisMonth: 0 },
]
