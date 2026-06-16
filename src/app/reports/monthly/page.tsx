import { AppShell } from "@/components/layout/app-shell";
import { MonthlyBreakdownPage } from "@/components/reports/monthly-breakdown";

export const dynamic = "force-dynamic";

export default function MonthlyBreakdown() {
  return (
    <AppShell>
      <MonthlyBreakdownPage />
    </AppShell>
  );
}
