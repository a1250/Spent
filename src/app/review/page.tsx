import { AppShell } from "@/components/layout/app-shell";
import { ReviewPage } from "@/components/review/review-page";

export const dynamic = "force-dynamic";

export default function Review() {
  return (
    <AppShell>
      <ReviewPage />
    </AppShell>
  );
}
