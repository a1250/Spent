"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ChevronLeft, ChevronRight, History, Trash2, AlertTriangle, EyeOff } from "lucide-react";
import {
  deleteAllTransactions,
  deleteExcludedMerchantRule,
  getAuditLog,
  getSettings,
  listExcludedMerchants,
  updateSettings,
} from "@/lib/api";
import { toast } from "sonner";
import { SectionShell, SettingCard } from "@/components/settings/section-shell";
import { WorkspaceDangerCard } from "@/components/settings/workspace-controls";
import { BANK_PROVIDERS } from "@/lib/types";
import { translateProviderName } from "@/lib/i18n-data";

export default function DataSettingsPage() {
  const t = useTranslations("settings.data");
  const tCommon = useTranslations("common");
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  });

  return (
    <SectionShell title={t("title")} description={t("description")}>
      {settings ? (
        <ShowBrowserCard initial={settings.showBrowser} />
      ) : (
        <SettingCard>
          <div className="text-sm text-muted-foreground">{tCommon("loading")}</div>
        </SettingCard>
      )}
      <SettingCard
        title={t("storageCardTitle")}
        description={t("storageCardDescription")}
      >
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <code>data/spent.db</code> · <code>data/.encryption-key</code>
        </div>
      </SettingCard>
      <AuditLogCard />
      <ExcludedMerchantsCard />
      <DangerZone />
      <WorkspaceDangerCard />
    </SectionShell>
  );
}

const PAGE_SIZE = 20;

function AuditLogCard() {
  const [offset, setOffset] = useState(0);
  const { data, isLoading } = useQuery({
    queryKey: ["audit-log", offset],
    queryFn: () => getAuditLog(PAGE_SIZE, offset),
  });

  const entries = data?.entries ?? [];
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  function formatField(field: string | null) {
    if (!field) return "";
    return field.replace(/_/g, " ");
  }

  function formatVal(val: string | null) {
    if (val == null || val === "") return <span className="text-muted-foreground/50">—</span>;
    return val;
  }

  return (
    <SettingCard
      title="Transaction History"
      description="Audit log of all field-level changes to transactions."
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-muted-foreground">
          {total === 0 ? "No entries yet" : `${total} total entries`}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              className="rounded p-1 hover:bg-accent disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-muted-foreground">
              {page} / {totalPages}
            </span>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => setOffset(offset + PAGE_SIZE)}
              className="rounded p-1 hover:bg-accent disabled:opacity-40"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center">
          <History className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
          <p className="text-xs text-muted-foreground">
            No audit entries yet. Changes to transactions will appear here.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="px-3 py-2 text-start font-medium text-muted-foreground">When</th>
                <th className="px-3 py-2 text-start font-medium text-muted-foreground">Transaction</th>
                <th className="px-3 py-2 text-start font-medium text-muted-foreground">Action</th>
                <th className="px-3 py-2 text-start font-medium text-muted-foreground">Field</th>
                <th className="px-3 py-2 text-start font-medium text-muted-foreground">From</th>
                <th className="px-3 py-2 text-start font-medium text-muted-foreground">To</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {entry.changedAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-3 py-2 max-w-[140px] truncate">
                    {entry.transactionDescription ?? (
                      <span className="text-muted-foreground/50">deleted</span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-medium">{entry.action}</td>
                  <td className="px-3 py-2 text-muted-foreground">{formatField(entry.fieldName)}</td>
                  <td className="px-3 py-2 max-w-[100px] truncate">{formatVal(entry.oldValue)}</td>
                  <td className="px-3 py-2 max-w-[100px] truncate">{formatVal(entry.newValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SettingCard>
  );
}

function DangerZone() {
  const t = useTranslations("settings.data");
  const tCommon = useTranslations("common");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: deleteAllTransactions,
    onSuccess: (data) => {
      toast.success(
        t("deletedToast", {
          txCount: data.deleted.txCount,
          memoryCount: data.deleted.memoryCount,
        })
      );
      queryClient.invalidateQueries();
      setConfirmOpen(false);
      setConfirmText("");
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("deleteFailedFallback"));
    },
  });

  const canConfirm = confirmText.trim().toLowerCase() === "delete";

  return (
    <>
      <div className="rounded-2xl border border-[color-mix(in_oklch,var(--status-over)_30%,transparent)] bg-[color-mix(in_oklch,var(--status-over)_6%,var(--card))] p-6">
        <div className="flex items-start gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
            style={{
              background:
                "color-mix(in oklch, var(--status-over) 14%, transparent)",
            }}
          >
            <AlertTriangle
              className="h-4 w-4"
              style={{ color: "var(--status-over)" }}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-medium">{t("dangerTitle")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("dangerDescription")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            style={{
              borderColor:
                "color-mix(in oklch, var(--status-over) 40%, transparent)",
              color: "var(--status-over)",
            }}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t("dangerButton")}
          </Button>
        </div>
      </div>

      <Dialog
        open={confirmOpen}
        onOpenChange={(o) => {
          if (!mutation.isPending) {
            setConfirmOpen(o);
            if (!o) setConfirmText("");
          }
        }}
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background:
                  "color-mix(in oklch, var(--status-over) 14%, transparent)",
              }}
            >
              <AlertTriangle
                className="h-5 w-5"
                style={{ color: "var(--status-over)" }}
              />
            </div>
            <div>
              <DialogTitle className="font-serif text-xl font-normal">
                {t("confirmDialogTitle")}
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                {t("confirmDialogDescription")}
              </DialogDescription>
            </div>
          </div>

          <div className="space-y-3 pt-2 text-sm">
            <p className="text-muted-foreground">{t("confirmRemovesIntro")}</p>
            <ul className="space-y-1 ps-5 text-xs text-muted-foreground">
              <li className="list-disc">{t("confirmRemovesAll")}</li>
              <li className="list-disc">{t("confirmRemovesSyncRuns")}</li>
              <li className="list-disc">{t("confirmRemovesMemory")}</li>
            </ul>
            <p className="text-xs text-muted-foreground">
              {t("confirmKeeps")}
            </p>

            <div className="pt-2">
              <Label
                htmlFor="confirm-input"
                className="text-xs text-muted-foreground"
              >
                {t("confirmTypePrefix")}{" "}
                <code className="font-mono">delete</code> {t("confirmTypeSuffix")}
              </Label>
              <Input
                id="confirm-input"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={t("confirmInputPlaceholder")}
                className="mt-1.5 h-9"
                autoFocus
                disabled={mutation.isPending}
              />
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setConfirmOpen(false);
                setConfirmText("");
              }}
              disabled={mutation.isPending}
            >
              {tCommon("cancel")}
            </Button>
            <Button
              size="sm"
              disabled={!canConfirm || mutation.isPending}
              onClick={() => mutation.mutate()}
              style={
                canConfirm
                  ? {
                      background: "var(--status-over)",
                      color: "var(--background)",
                    }
                  : undefined
              }
              className="gap-1.5"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {mutation.isPending ? tCommon("deleting") : t("deleteEverything")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ExcludedMerchantsCard() {
  const t = useTranslations("settings.data");
  const tBanks = useTranslations("banks");
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["excluded-merchants"],
    queryFn: listExcludedMerchants,
  });
  const removeMutation = useMutation({
    mutationFn: deleteExcludedMerchantRule,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["excluded-merchants"] });
      queryClient.invalidateQueries({ queryKey: ["transactions"] });
      queryClient.invalidateQueries({ queryKey: ["summary"] });
      queryClient.invalidateQueries({ queryKey: ["home"] });
      toast.success(t("excludedRemoved"));
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : t("excludedRemoveFailed"));
    },
  });

  const rules = data?.rules ?? [];

  return (
    <SettingCard
      title={t("excludedTitle")}
      description={t("excludedDescription")}
    >
      {isLoading ? (
        <div className="text-sm text-muted-foreground">{t("excludedLoading")}</div>
      ) : rules.length === 0 ? (
        <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-4 text-center text-xs text-muted-foreground">
          {t("excludedEmpty")}
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rules.map((rule) => {
            const info = BANK_PROVIDERS.find((b) => b.id === rule.provider);
            const providerName = translateProviderName(
              rule.provider,
              info?.name ?? rule.provider,
              tBanks,
            );
            return (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate font-medium">
                      {rule.merchantKey}
                    </span>
                  </div>
                  <div className="ms-5 text-[11px] text-muted-foreground">
                    {providerName}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
                  onClick={() => removeMutation.mutate(rule.id)}
                  disabled={removeMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  {t("excludedRemoveBtn")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </SettingCard>
  );
}

function ShowBrowserCard({ initial }: { initial: boolean }) {
  const t = useTranslations("settings.data");
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(initial);
  const mutation = useMutation({
    mutationFn: (value: boolean) => updateSettings({ showBrowser: value }),
    onSuccess: (_, value) => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      toast.success(value ? t("browserVisibleSaved") : t("browserHiddenSaved"));
    },
  });

  const handleToggle = (value: boolean) => {
    setEnabled(value);
    mutation.mutate(value);
  };

  return (
    <SettingCard>
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <Label htmlFor="show-browser-toggle">{t("showBrowserLabel")}</Label>
          <p className="text-xs text-muted-foreground">
            {t("showBrowserHint")}
          </p>
        </div>
        <Switch
          id="show-browser-toggle"
          checked={enabled}
          onCheckedChange={handleToggle}
        />
      </div>
    </SettingCard>
  );
}
