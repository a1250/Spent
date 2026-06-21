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
import {
  ChevronLeft,
  ChevronRight,
  History,
  Trash2,
  AlertTriangle,
  EyeOff,
  Archive,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Download,
} from "lucide-react";
import {
  createBackup,
  deleteAllTransactions,
  deleteExcludedMerchantRule,
  getAuditLog,
  getSettings,
  listBackupsApi,
  listExcludedMerchants,
  restoreFromBackup,
  updateSettings,
  type BackupRecord,
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
      <BackupCard />
      <AuditLogCard />
      <ExcludedMerchantsCard />
      <DangerZone />
      <WorkspaceDangerCard />
    </SectionShell>
  );
}

const PAGE_SIZE = 20;

function IntegrityIcon({ status }: { status: "ok" | "failed" | "unknown" }) {
  if (status === "ok") return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
  if (status === "failed") return <XCircle className="h-3.5 w-3.5 text-red-500" />;
  return <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/50" />;
}

function BackupCard() {
  const queryClient = useQueryClient();
  const [restoreTarget, setRestoreTarget] = useState<BackupRecord | null>(null);
  const [restoreConfirmText, setRestoreConfirmText] = useState("");
  const [restoreSuccess, setRestoreSuccess] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["backups"],
    queryFn: listBackupsApi,
  });

  const createMutation = useMutation({
    mutationFn: createBackup,
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["backups"] });
      toast.success(
        `Backup created: ${res.backup.filename} (${res.backup.sizeMb} MB, ${res.backup.transactionCount ?? 0} transactions)`
      );
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Backup failed");
    },
  });

  const restoreMutation = useMutation({
    mutationFn: ({ filename, confirmation }: { filename: string; confirmation: string }) =>
      restoreFromBackup(filename, confirmation),
    onSuccess: () => {
      setRestoreTarget(null);
      setRestoreConfirmText("");
      setRestoreSuccess(true);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Restore failed");
    },
  });

  const backups = data?.backups ?? [];
  const userBackups = backups.filter((b) => !b.isSystemBackup);
  const systemBackups = backups.filter((b) => b.isSystemBackup);

  const canRestore = restoreConfirmText === "restore database";

  return (
    <>
      <SettingCard
        title="Backups"
        description="Create and restore SQLite backups of your workspace data."
      >
        {restoreSuccess && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-700 dark:text-amber-400">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Restore complete. Restart the server (<code>npm run dev</code>) to load the
              restored database.
            </span>
          </div>
        )}

        <div className="mb-4 flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {userBackups.length === 0
              ? "No manual backups yet"
              : `${userBackups.length} manual backup${userBackups.length !== 1 ? "s" : ""}`}
          </p>
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            <Archive className="h-3.5 w-3.5" />
            {createMutation.isPending ? "Creating…" : "Create backup"}
          </Button>
        </div>

        {isLoading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : backups.length === 0 ? (
          <div className="rounded-lg border border-dashed bg-muted/30 px-3 py-6 text-center">
            <Archive className="mx-auto mb-2 h-5 w-5 text-muted-foreground/40" />
            <p className="text-xs text-muted-foreground">
              No backups yet. Use Create backup to make a safe copy of your data.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {userBackups.length > 0 && (
              <BackupList
                title="Manual backups"
                backups={userBackups}
                onRestore={(b) => {
                  setRestoreTarget(b);
                  setRestoreConfirmText("");
                  setRestoreSuccess(false);
                }}
              />
            )}
            {systemBackups.length > 0 && (
              <BackupList
                title="System backups"
                backups={systemBackups}
                onRestore={(b) => {
                  setRestoreTarget(b);
                  setRestoreConfirmText("");
                  setRestoreSuccess(false);
                }}
              />
            )}
          </div>
        )}
      </SettingCard>

      <Dialog
        open={restoreTarget !== null}
        onOpenChange={(o) => {
          if (!restoreMutation.isPending) {
            if (!o) {
              setRestoreTarget(null);
              setRestoreConfirmText("");
            }
          }
        }}
      >
        <DialogContent className="max-w-md">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: "color-mix(in oklch, var(--status-over) 14%, transparent)",
              }}
            >
              <RotateCcw className="h-5 w-5" style={{ color: "var(--status-over)" }} />
            </div>
            <div>
              <DialogTitle className="font-serif text-xl font-normal">
                Restore database
              </DialogTitle>
              <DialogDescription className="mt-1 text-xs">
                This will replace your live database with this backup.
              </DialogDescription>
            </div>
          </div>

          {restoreTarget && (
            <div className="space-y-3 pt-2 text-sm">
              <div className="rounded-lg border bg-muted/30 px-3 py-2 text-xs">
                <div className="font-medium">{restoreTarget.filename}</div>
                <div className="mt-0.5 text-muted-foreground">
                  {restoreTarget.createdAt.slice(0, 16).replace("T", " ")} ·{" "}
                  {restoreTarget.sizeMb} MB ·{" "}
                  {restoreTarget.transactionCount != null
                    ? `${restoreTarget.transactionCount} transactions`
                    : "unknown size"}
                </div>
              </div>

              <p className="text-muted-foreground text-xs leading-relaxed">
                A pre-restore backup of your current database will be created automatically
                before restoring. After the restore completes, restart the server to load
                the restored data.
              </p>

              <div className="pt-1">
                <Label htmlFor="restore-confirm-input" className="text-xs text-muted-foreground">
                  Type <code className="font-mono">restore database</code> to confirm
                </Label>
                <Input
                  id="restore-confirm-input"
                  value={restoreConfirmText}
                  onChange={(e) => setRestoreConfirmText(e.target.value)}
                  placeholder="restore database"
                  className="mt-1.5 h-9 font-mono text-xs"
                  autoFocus
                  disabled={restoreMutation.isPending}
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setRestoreTarget(null);
                setRestoreConfirmText("");
              }}
              disabled={restoreMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canRestore || restoreMutation.isPending}
              onClick={() => {
                if (restoreTarget) {
                  restoreMutation.mutate({
                    filename: restoreTarget.filename,
                    confirmation: restoreConfirmText,
                  });
                }
              }}
              style={
                canRestore
                  ? {
                      background: "var(--status-over)",
                      color: "var(--background)",
                    }
                  : undefined
              }
              className="gap-1.5"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {restoreMutation.isPending ? "Restoring…" : "Restore"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BackupList({
  title,
  backups,
  onRestore,
}: {
  title: string;
  backups: BackupRecord[];
  onRestore: (b: BackupRecord) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">{title}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/30">
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">File</th>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">Created</th>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">Size</th>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">Integrity</th>
              <th className="px-3 py-2 text-start font-medium text-muted-foreground">Tx</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {backups.map((b) => (
              <tr key={b.filename} className="hover:bg-muted/20">
                <td className="max-w-[160px] truncate px-3 py-2 font-mono text-[11px]">
                  {b.filename}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {b.createdAt.slice(0, 16).replace("T", " ")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {b.sizeMb} MB
                </td>
                <td className="px-3 py-2">
                  <IntegrityIcon status={b.integrity} />
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {b.transactionCount ?? <span className="text-muted-foreground/40">—</span>}
                </td>
                <td className="px-3 py-2 text-end">
                  <div className="flex items-center justify-end gap-1">
                    <a
                      href={`/api/data/backups/${encodeURIComponent(b.filename)}/download`}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Download className="h-3 w-3" />
                      Download
                    </a>
                    <button
                      type="button"
                      onClick={() => onRestore(b)}
                      className="inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <RotateCcw className="h-3 w-3" />
                      Restore
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
