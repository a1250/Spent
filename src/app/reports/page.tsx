import { AppShell } from "@/components/layout/app-shell";
import { ReportsHubPage } from "@/components/reports/reports-hub";

export const dynamic = "force-dynamic";

export default function ReportsHub() {
  return (
    <AppShell>
      <ReportsHubPage />
    </AppShell>
  );
}
