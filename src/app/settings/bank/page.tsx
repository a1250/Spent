"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import {
  ChevronRight,
  Plus,
  RefreshCw,
  Loader2,
  CircleCheck,
  CircleAlert,
  FileUp,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderBadge } from "@/components/setup/provider-badge";
import { SectionShell } from "@/components/settings/section-shell";
import { BankDetailSheet } from "@/components/settings/bank-detail-sheet";
import { useBankSync } from "@/components/settings/use-bank-sync";
import { listIntegrations } from "@/lib/api";
import { BANK_PROVIDERS } from "@/lib/types";
import { translateProviderName, useFormatterLabels } from "@/lib/i18n-data";
import { formatLastSync } from "@/lib/formatters";
import type { Integration } from "@/lib/types";

interface SheetState {
  open: boolean;
  mode: "edit" | "add";
  providerId: string | null;
  credentialId: number | null;
}

export default function BankSettingsPage() {
  const t = useTranslations("settings.bank");
  const tBanks = useTranslations("banks");
  const labels = useFormatterLabels();

  const { data: integrations = [] } = useQuery({
    queryKey: ["integrations"],
    queryFn: listIntegrations,
  });
  const { start, stateFor, anySyncing } = useBankSync();
  const [sheet, setSheet] = useState<SheetState>({
    open: false,
    mode: "edit",
    providerId: null,
    credentialId: null,
  });

  const lastSync = useMemo(() => {
    const stamps = integrations
      .map((i) => i.lastSyncAt)
      .filter((s): s is string => Boolean(s));
    if (stamps.length === 0) return null;
    return stamps.sort().slice(-1)[0];
  }, [integrations]);

  const lastImportAt = integrations[0]?.lastImportAt ?? null;

  const availableToAdd = BANK_PROVIDERS.filter((b) => b.enabled);
  const connectedProviderIds = new Set(integrations.map((i) => i.provider));

  const handleSyncAll = () => {
    integrations.forEach((i) => start(i.id));
  };

  const sheetIntegration: Integration | null =
    sheet.mode === "edit" && sheet.credentialId != null
      ? integrations.find((i) => i.id === sheet.credentialId) ?? null
      : null;

  const countLabel =
    integrations.length === 1
      ? t("banksConnectedOne", { count: integrations.length })
      : t("banksConnectedOther", { count: integrations.length });

  return (
    <>
      <SectionShell title={t("title")} description={t("description")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-muted-foreground">
            {countLabel}
            {lastSync ? (
              <>
                {" · "}
                <span className="text-foreground/80">
                  {t("lastSync", { time: formatLastSync(lastSync, labels) })}
                </span>
              </>
            ) : null}
            {lastImportAt ? (
              <>
                {" · "}
                <span className="text-foreground/80">
                  Last import:{" "}
                  {new Date(lastImportAt).toLocaleDateString("en-IL", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                {" · "}
                <a
                  href="/import/history"
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  View history
                </a>
              </>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              nativeButton={false}
              className="gap-1.5"
              render={
                <Link href="/">
                  Continue to Dashboard
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              }
            />
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              className="gap-1.5"
              render={
                <Link href="/import">
                  <FileUp className="h-3.5 w-3.5" />
                  Import a file instead
                </Link>
              }
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleSyncAll}
              disabled={integrations.length === 0 || anySyncing}
              className="gap-1.5"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {anySyncing ? t("syncing") : t("syncAll")}
            </Button>
            {availableToAdd.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <Button size="sm" className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {t("addBank")}
                    </Button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  {availableToAdd.map((b) => (
                    <DropdownMenuItem
                      key={b.id}
                      onClick={() =>
                        setSheet({
                          open: true,
                          mode: "add",
                          providerId: b.id,
                          credentialId: null,
                        })
                      }
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: b.color }}
                        />
                        {translateProviderName(b.id, b.name, tBanks)}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {integrations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <h2 className="font-serif text-xl text-foreground">
              Connections are optional
            </h2>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
              You can connect a supported bank or card, import files, add
              transactions manually, or continue using the dashboard without a
              data service.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                size="sm"
                nativeButton={false}
                render={<Link href="/">Continue to Dashboard</Link>}
              />
              <Button
                size="sm"
                variant="outline"
                nativeButton={false}
                render={<Link href="/import">Import a file instead</Link>}
              />
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <ul className="divide-y divide-border/60">
              {integrations.map((integration) => {
                const info = BANK_PROVIDERS.find(
                  (b) => b.id === integration.provider
                );
                if (!info) return null;
                const sync = stateFor(integration.id);
                const localName = translateProviderName(info.id, info.name, tBanks);
                const openSheet = () =>
                  setSheet({
                    open: true,
                    mode: "edit",
                    providerId: integration.provider,
                    credentialId: integration.id,
                  });
                const subline = integration.lastSyncAt
                  ? t("transactionsCountWithSync", {
                      count: integration.transactionCount,
                      time: formatLastSync(integration.lastSyncAt, labels),
                    })
                  : t("transactionsCountNever", {
                      count: integration.transactionCount,
                    });
                return (
                  <li
                    key={integration.id}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
                  >
                    <button
                      type="button"
                      onClick={openSheet}
                      aria-label={t("openDetails", {
                        name: `${integration.label} (${localName})`,
                      })}
                      className="flex min-w-0 flex-1 items-center gap-3 text-start"
                    >
                      <ProviderBadge
                        color={info.color}
                        name={localName}
                        domain={info.domain}
                        size={36}
                        radius={9}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          {integration.label}
                          <StatusPill
                            lastSyncAt={integration.lastSyncAt}
                            syncing={sync.syncing}
                          />
                        </div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">
                          {localName}
                          {" · "}
                          {subline}
                        </div>
                      </div>
                    </button>
                    <SyncShortButton
                      syncing={sync.syncing}
                      stage={sync.stage}
                      onClick={() => start(integration.id)}
                    />
                    <button
                      type="button"
                      onClick={openSheet}
                      aria-label={t("openDetails", {
                        name: `${integration.label} (${localName})`,
                      })}
                      className="-me-1 shrink-0 rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground"
                    >
                      <ChevronRight className="h-4 w-4 rtl:rotate-180" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
        <ProviderStatusGrid
          connectedProviderIds={connectedProviderIds}
          onPick={(providerId) =>
            setSheet({
              open: true,
              mode: "add",
              providerId,
              credentialId: null,
            })
          }
        />
      </SectionShell>

      <BankDetailSheet
        open={sheet.open}
        mode={sheet.mode}
        providerId={sheet.providerId}
        credentialId={sheet.credentialId}
        connected={sheetIntegration}
        onClose={() => setSheet((s) => ({ ...s, open: false }))}
      />
    </>
  );
}

function ProviderStatusGrid({
  connectedProviderIds,
  onPick,
}: {
  connectedProviderIds: Set<string>;
  onPick: (providerId: string) => void;
}) {
  const tBanks = useTranslations("banks");
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-serif text-xl">Available data sources</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          These are optional local data sources. Connection failures never block
          dashboard, file import, reports, or manual transactions.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {BANK_PROVIDERS.map((provider) => {
          const connected = connectedProviderIds.has(provider.id);
          const status = connected
            ? "connected"
            : provider.enabled
              ? provider.supportsProgrammaticTwoFactor
                ? "available"
                : "manual"
              : "coming later";
          return (
            <button
              key={provider.id}
              type="button"
              disabled={!provider.enabled}
              onClick={() => provider.enabled && onPick(provider.id)}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 text-start transition-colors hover:bg-muted/40 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ProviderBadge
                color={provider.color}
                name={provider.name}
                domain={provider.domain}
                size={34}
                radius={8}
              />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {translateProviderName(provider.id, provider.name, tBanks)}
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {provider.blurb}
                </div>
              </div>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize text-muted-foreground">
                {status}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

function StatusPill({
  lastSyncAt,
  syncing,
}: {
  lastSyncAt: string | null;
  syncing: boolean;
}) {
  const t = useTranslations("settings.bank");
  if (syncing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> {t("statusSyncing")}
      </span>
    );
  }
  if (!lastSyncAt) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
        <CircleAlert className="h-3 w-3" /> {t("statusNeverSynced")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300">
      <CircleCheck className="h-3 w-3" /> {t("statusConnected")}
    </span>
  );
}

function SyncShortButton({
  syncing,
  stage,
  onClick,
}: {
  syncing: boolean;
  stage: string;
  onClick: () => void;
}) {
  const t = useTranslations("settings.bank");
  if (syncing) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">{stage || t("syncing")}</span>
      </span>
    );
  }
  return (
    <Button
      variant="ghost"
      size="sm"
      className="shrink-0 gap-1.5"
      onClick={onClick}
    >
      <RefreshCw className="h-3.5 w-3.5" />
      {t("syncShort")}
    </Button>
  );
}
