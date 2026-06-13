import { AppShell } from "@/components/layout/app-shell";
import { MonthlyPnLPreviewPage } from "@/components/reports/monthly-pnl-preview";

export const dynamic = "force-dynamic";

export default function MonthlyPnLPreview() {
  return (
    <AppShell>
      <MonthlyPnLPreviewPage />
    </AppShell>
  );
}
