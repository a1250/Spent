import { AppShell } from "@/components/layout/app-shell";
import { DataQualityDashboardPage } from "@/components/reports/data-quality-dashboard";

export const dynamic = "force-dynamic";

export default function DataQualityReport() {
  return (
    <AppShell>
      <DataQualityDashboardPage />
    </AppShell>
  );
}
