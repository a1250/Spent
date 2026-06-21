import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/components/home/home-page";

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <AppShell>
      <HomePage />
    </AppShell>
  );
}
