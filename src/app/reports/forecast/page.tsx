import { AppShell } from "@/components/layout/app-shell";
import { ForecastDashboardPage } from "@/components/reports/forecast-dashboard";

export const dynamic = "force-dynamic";

export default function ForecastPage() {
  return (
    <AppShell>
      <ForecastDashboardPage />
    </AppShell>
  );
}
