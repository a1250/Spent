import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { AppShell, PageHeader } from "@/components/layout/app-shell";

export default async function ImportLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations("import");
  return (
    <AppShell>
      <PageHeader title={t("pageTitle")} />
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8 md:py-8">
        {children}
      </main>
    </AppShell>
  );
}
