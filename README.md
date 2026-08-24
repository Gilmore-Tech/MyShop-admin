This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Testing

```bash
npm test                 # every contract test under tests/ (Node's built-in runner)
npm run test:<name>      # one file, e.g. npm run test:commission-ledger
npm run lint && npm run build
```

## Insights and reports

The stakeholder-facing reports live under **Insights** in the sidebar (`/insights/revenue`,
`/insights/trips`, `/insights/leaderboards`), **Operations** (`/online-providers`) and
**Payments** (`/payments/commission-ledger`). Each page reads one endpoint through a
tolerant normaliser in `lib/*-contract.ts`, shares the kit in `components/common/`
(`StatCard`, `PeriodControls`, `ReportTable`, `LeaderboardList`, `VerticalTabs`), and
shows a "not yet available" state when the backing endpoint is not deployed. See
`docs/admin-module.md` for the endpoint registry and the revenue definitions.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

Thank you..
