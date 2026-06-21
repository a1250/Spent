import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/components/dashboard/dashboard";

export const dynamic = "force-dynamic";

export default function BudgetPage() {
  return (
    <AppShell>
      <Dashboard />
    </AppShell>
  );
}
