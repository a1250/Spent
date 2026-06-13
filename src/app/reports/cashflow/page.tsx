import { AppShell } from "@/components/layout/app-shell";
import { MonthlyCashFlowPreviewPage } from "@/components/reports/monthly-cash-flow-preview";

export const dynamic = "force-dynamic";

export default function CashFlowPreview() {
  return (
    <AppShell>
      <MonthlyCashFlowPreviewPage />
    </AppShell>
  );
}
