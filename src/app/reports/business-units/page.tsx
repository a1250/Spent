import { AppShell } from "@/components/layout/app-shell";
import { BusinessUnitDashboardPage } from "@/components/reports/business-unit-dashboard";

export const dynamic = "force-dynamic";

export default function BusinessUnitsReport() {
  return (
    <AppShell>
      <BusinessUnitDashboardPage />
    </AppShell>
  );
}
