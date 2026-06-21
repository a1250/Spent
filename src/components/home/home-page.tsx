"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowRight, Building2, FileUp, Plus, Table2 } from "lucide-react";
import {
  getActivity,
  getDataQualitySummary,
  getHome,
  getNeedsReviewTransactions,
} from "@/lib/api";
import { PageHeader } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { SyncButton } from "@/components/dashboard/sync-button";
import { CategorizeButton } from "@/components/dashboard/categorize-button";
import { AINotConnectedBanner } from "@/components/ai-not-connected-banner";
import { ThisMonthCard } from "./this-month-card";
import { CashFlowCard } from "./cash-flow-card";
import { CategorySnapshotCard } from "./category-snapshot-card";
import { HistoricalTrendCard } from "./historical-trend-card";
import { RecentTransactionsCard } from "./recent-transactions-card";
import { TopMerchantsCard } from "./top-merchants-card";
import { NeedsAttentionCard } from "./needs-attention-card";
import { BankHealthCard } from "./bank-health-card";
import { SyncStatusPill } from "./sync-status-pill";
import { SyncFailureBanner } from "./sync-failure-banner";
import { NeedsReviewWidget } from "./needs-review-widget";
import { CoverageBanner } from "@/components/review/coverage-banner";
import { CardError, CardSkeleton } from "./card-shell";
import type { HomePayload, HomeSection } from "@/lib/types";

const ROW_1 = "col-span-12 lg:col-span-8";
const ROW_1_SIDE = "col-span-12 md:col-span-6 lg:col-span-4";
const ROW_2 = "col-span-12 md:col-span-6 lg:col-span-7";
const ROW_2_SIDE = "col-span-12 md:col-span-6 lg:col-span-5";

export function HomePage() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [autoStartSync] = useState(() => searchParams.get("sync") === "1");
  const t = useTranslations("home");
  const skeletonLabels = useMemo<Record<HomeSection, string>>(
    () => ({
      thisMonth: t("thisMonthLabel", { month: "" }).trim() || t("topCategoriesTitle"),
      cashFlow: t("cashFlowTitle"),
      categorySnapshot: t("topCategoriesTitle"),
      historicalTrend: t("last8Months"),
      recentTransactions: t("recentActivity"),
      topMerchants: t("topMerchants"),
      needsAttention: t("needsAttention"),
      bankHealth: t("bankConnections"),
    }),
    [t]
  );

  useEffect(() => {
    if (autoStartSync) {
      router.replace("/", { scroll: false });
    }
  }, [autoStartSync, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["home"],
    queryFn: getHome,
  });
  const { data: qualitySummary } = useQuery({
    queryKey: ["review-summary"],
    queryFn: getDataQualitySummary,
  });
  const { data: reviewPreview = [] } = useQuery({
    queryKey: ["review-transactions", { limit: 3 }],
    queryFn: () => getNeedsReviewTransactions({ limit: 3 }),
  });

  const [activityPopoverOpen, setActivityPopoverOpen] = useState(false);
  const { data: activity } = useQuery({
    queryKey: ["activity"],
    queryFn: getActivity,
    refetchInterval: (q) => {
      const a = q.state.data;
      if (activityPopoverOpen) return 3000;
      if (a?.sync.active) return 3000;
      return 15000;
    },
    refetchIntervalInBackground: false,
  });

  const handleActivityOpenChange = useCallback(
    (open: boolean) => {
      setActivityPopoverOpen(open);
      if (open) queryClient.invalidateQueries({ queryKey: ["activity"] });
    },
    [queryClient]
  );

  const handleSyncOrCategorizeComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["home"] });
    queryClient.invalidateQueries({ queryKey: ["summary"] });
    queryClient.invalidateQueries({ queryKey: ["transactions"] });
    queryClient.invalidateQueries({ queryKey: ["settings"] });
    queryClient.invalidateQueries({ queryKey: ["activity"] });
    queryClient.invalidateQueries({ queryKey: ["review-summary"] });
    queryClient.invalidateQueries({ queryKey: ["review-transactions"] });
  }, [queryClient]);

  return (
    <>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <>
            <SyncStatusPill
              items={data?.bankHealth ?? null}
              nextScheduledSync={data?.nextScheduledSync ?? null}
              activity={activity ?? null}
              onOpenChange={handleActivityOpenChange}
            />
            <CategorizeButton onApplied={handleSyncOrCategorizeComplete} />
            <SyncButton
              onComplete={handleSyncOrCategorizeComplete}
              autoStart={autoStartSync}
            />
          </>
        }
      />

      <div className="p-4 md:p-6 lg:p-8">
        <EntryActions
          isFreshWorkspace={
            data != null &&
            data.transactionCount === 0 &&
            data.integrationCount === 0
          }
          className="mb-4 md:mb-5 lg:mb-6"
        />
        <SyncFailureBanner
          items={data?.bankHealth ?? null}
          className="mb-4 md:mb-5 lg:mb-6"
        />
        <AINotConnectedBanner className="mb-4 md:mb-5 lg:mb-6" />
        {qualitySummary && (
          <div className="mb-4 grid gap-4 md:mb-5 lg:mb-6 lg:grid-cols-[minmax(0,1fr)_360px]">
            <CoverageBanner summary={qualitySummary} />
            <NeedsReviewWidget
              rows={reviewPreview}
              total={qualitySummary.needsReviewTransactions}
            />
          </div>
        )}
        <div className="grid grid-cols-12 gap-4 md:gap-5 lg:gap-6">
          {renderSection("thisMonth", data, isLoading, isError, ROW_1, skeletonLabels)}
          {renderSection("cashFlow", data, isLoading, isError, ROW_1_SIDE, skeletonLabels)}
          {renderSection("categorySnapshot", data, isLoading, isError, ROW_2, skeletonLabels)}
          {renderSection("historicalTrend", data, isLoading, isError, ROW_2_SIDE, skeletonLabels)}
          {renderSection("recentTransactions", data, isLoading, isError, ROW_2, skeletonLabels)}
          {renderSection("topMerchants", data, isLoading, isError, ROW_2_SIDE, skeletonLabels)}
          {renderSection("needsAttention", data, isLoading, isError, ROW_2, skeletonLabels)}
          {renderSection("bankHealth", data, isLoading, isError, ROW_2_SIDE, skeletonLabels)}
        </div>
      </div>
    </>
  );
}

function EntryActions({
  isFreshWorkspace,
  className,
}: {
  isFreshWorkspace: boolean;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border bg-card p-4 md:p-5 ${className ?? ""}`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {isFreshWorkspace ? "Welcome to BudgetWise" : "Start here"}
          </div>
          <h2 className="mt-1 font-serif text-2xl leading-tight">
            {isFreshWorkspace
              ? "Choose how you want to use your workspace"
              : "Dashboard, imports, and connections are all optional paths"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Connect a service, import a file, add transactions manually, or keep
            using the dashboard without an integration.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            nativeButton={false}
            className="gap-1.5"
            render={
              <Link href="/">
                Go to Dashboard
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            }
          />
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            className="gap-1.5"
            render={
              <Link href="/settings/bank">
                <Building2 className="h-3.5 w-3.5" />
                Connect Bank or Service
              </Link>
            }
          />
          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            className="gap-1.5"
            render={
              <Link href="/import">
                <FileUp className="h-3.5 w-3.5" />
                Import File
              </Link>
            }
          />
          <Button
            size="sm"
            variant="ghost"
            nativeButton={false}
            className="gap-1.5"
            render={
              <Link href="/transactions">
                <Plus className="h-3.5 w-3.5" />
                Add Manual Transaction
              </Link>
            }
          />
        </div>
      </div>
      {isFreshWorkspace && (
        <div className="mt-4 grid gap-2 border-t pt-4 text-xs text-muted-foreground sm:grid-cols-3">
          <div className="flex items-center gap-2">
            <Table2 className="h-3.5 w-3.5" />
            Continue without connecting
          </div>
          <div className="flex items-center gap-2">
            <FileUp className="h-3.5 w-3.5" />
            Upload statements when ready
          </div>
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" />
            Add integrations later
          </div>
        </div>
      )}
    </section>
  );
}

function renderSection(
  section: HomeSection,
  data: HomePayload | undefined,
  isLoading: boolean,
  isError: boolean,
  spanClass: string,
  skeletonLabels: Record<HomeSection, string>
) {
  if (isLoading || !data) {
    return (
      <div key={section} className={spanClass}>
        <CardSkeleton label={skeletonLabels[section]} height={SKELETON_HEIGHTS[section]} />
      </div>
    );
  }

  const sectionHasError =
    isError || data.errors.some((e) => e.section === section);

  if (sectionHasError) {
    return (
      <div key={section} className={spanClass}>
        <CardError label={skeletonLabels[section]} />
      </div>
    );
  }

  return (
    <div key={section} className={spanClass}>
      {renderCard(section, data)}
    </div>
  );
}

function renderCard(section: HomeSection, data: HomePayload) {
  switch (section) {
    case "thisMonth":
      return data.thisMonth ? <ThisMonthCard data={data.thisMonth} /> : null;
    case "cashFlow":
      return data.cashFlow ? <CashFlowCard data={data.cashFlow} /> : null;
    case "categorySnapshot":
      return data.categorySnapshot ? (
        <CategorySnapshotCard items={data.categorySnapshot} />
      ) : null;
    case "historicalTrend":
      return data.historicalTrend ? (
        <HistoricalTrendCard data={data.historicalTrend} />
      ) : null;
    case "recentTransactions":
      return data.recentTransactions ? (
        <RecentTransactionsCard items={data.recentTransactions} />
      ) : null;
    case "topMerchants":
      return data.topMerchants ? (
        <TopMerchantsCard items={data.topMerchants} />
      ) : null;
    case "needsAttention":
      return data.needsAttention ? (
        <NeedsAttentionCard data={data.needsAttention} />
      ) : null;
    case "bankHealth":
      return data.bankHealth ? (
        <BankHealthCard items={data.bankHealth} />
      ) : null;
  }
}

const SKELETON_HEIGHTS: Record<HomeSection, number> = {
  thisMonth: 180,
  cashFlow: 160,
  categorySnapshot: 220,
  historicalTrend: 180,
  recentTransactions: 280,
  topMerchants: 220,
  needsAttention: 160,
  bankHealth: 160,
};
