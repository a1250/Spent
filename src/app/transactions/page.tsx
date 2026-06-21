import { Suspense } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { TransactionsPage } from "@/components/transactions/transactions-page";

export const dynamic = "force-dynamic";

export default function Transactions() {
  return (
    <AppShell>
      <Suspense>
        <TransactionsPage />
      </Suspense>
    </AppShell>
  );
}
