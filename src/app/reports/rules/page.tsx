import { AppShell } from "@/components/layout/app-shell";
import { RuleEffectivenessPage } from "@/components/reports/rule-effectiveness";

export const dynamic = "force-dynamic";

export default function RulesReport() {
  return (
    <AppShell>
      <RuleEffectivenessPage />
    </AppShell>
  );
}
