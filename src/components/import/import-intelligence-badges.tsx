import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Clock3,
  Copy,
  DatabaseZap,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  CashFlowType,
  ClassificationStatus,
  ImportRowStatus,
  PnlImpact,
  RuleSource,
} from "@/lib/types";

const classificationLabels: Record<ClassificationStatus, string> = {
  needs_review: "Needs review",
  manually_approved: "Manually approved",
  auto_classified: "Auto classified",
  locked: "Locked",
};

const importStatusLabels: Record<ImportRowStatus, string> = {
  pending: "Pending",
  pending_duplicate: "Pending duplicate",
  approved: "Approved",
  rejected: "Rejected",
  skipped_duplicate: "Skipped duplicate",
  imported: "Imported",
};

const cashFlowLabels: Record<CashFlowType, string> = {
  real_cash_in: "Cash in",
  real_cash_out: "Cash out",
  internal_transfer: "Internal transfer",
  non_cash: "Non-cash",
  pending: "Pending",
  unknown: "Unknown cash flow",
};

export function ClassificationStatusBadge({
  status,
  label,
}: {
  status: ClassificationStatus;
  label?: string;
}) {
  const Icon =
    status === "needs_review"
      ? AlertCircle
      : status === "locked"
        ? LockKeyhole
        : CheckCircle2;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 whitespace-nowrap",
        status === "needs_review" &&
          "border-amber-500/40 bg-amber-500/8 text-amber-800 dark:text-amber-300",
        status === "manually_approved" &&
          "border-emerald-500/35 bg-emerald-500/8 text-emerald-800 dark:text-emerald-300",
        status === "auto_classified" &&
          "border-sky-500/35 bg-sky-500/8 text-sky-800 dark:text-sky-300",
        status === "locked" && "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3" />
      {label ?? classificationLabels[status]}
    </Badge>
  );
}

export function ImportRowStatusBadge({
  status,
}: {
  status: ImportRowStatus;
}) {
  const Icon =
    status === "pending_duplicate"
      ? Copy
      : status === "skipped_duplicate" || status === "rejected"
        ? Ban
        : status === "pending"
          ? Clock3
          : CheckCircle2;

  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 whitespace-nowrap",
        status === "pending_duplicate" &&
          "border-amber-500/40 bg-amber-500/8 text-amber-800 dark:text-amber-300",
        status === "pending" &&
          "border-violet-500/35 bg-violet-500/8 text-violet-800 dark:text-violet-300",
        status === "imported" &&
          "border-emerald-500/35 bg-emerald-500/8 text-emerald-800 dark:text-emerald-300",
        (status === "skipped_duplicate" || status === "rejected") &&
          "bg-muted text-muted-foreground"
      )}
    >
      <Icon className="h-3 w-3" />
      {importStatusLabels[status]}
    </Badge>
  );
}

export function TransactionStatusBadge({
  status,
}: {
  status: "completed" | "pending";
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        status === "pending"
          ? "border-violet-500/35 bg-violet-500/8 text-violet-800 dark:text-violet-300"
          : "text-muted-foreground"
      )}
    >
      {status === "pending" ? "Pending transaction" : "Completed"}
    </Badge>
  );
}

export function RuleProvenanceBadge({
  ruleId,
  source,
  confidence,
  legacyRuleCategory,
}: {
  ruleId: number | null;
  source: RuleSource | null;
  confidence: number | null;
  legacyRuleCategory?: string | null;
}) {
  if (ruleId != null) {
    const userApproved = source === "user_approved";
    const Icon = userApproved ? ShieldCheck : Sparkles;
    const confidenceLabel =
      confidence == null ? "" : ` · ${(confidence * 100).toFixed(0)}%`;
    const sourceLabel = source?.replaceAll("_", " ") ?? "unknown source";

    return (
      <Badge
        variant="outline"
        className={cn(
          "gap-1 whitespace-nowrap",
          userApproved
            ? "border-sky-500/35 bg-sky-500/8 text-sky-800 dark:text-sky-300"
            : "border-violet-500/35 bg-violet-500/8 text-violet-800 dark:text-violet-300"
        )}
      >
        <Icon className="h-3 w-3" />
        {userApproved ? "User-approved rule" : sourceLabel} #{ruleId}
        {confidenceLabel}
      </Badge>
    );
  }

  if (legacyRuleCategory?.trim()) {
    return (
      <Badge
        variant="outline"
        className="gap-1 whitespace-nowrap border-amber-500/35 bg-amber-500/8 text-amber-800 dark:text-amber-300"
        title={`Legacy suggestion: ${legacyRuleCategory}. It did not auto-classify this row.`}
      >
        <DatabaseZap className="h-3 w-3" />
        Legacy/seed suggestion only
      </Badge>
    );
  }

  return null;
}

export function PnlImpactBadge({ impact }: { impact: PnlImpact }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "whitespace-nowrap",
        impact === "yes" &&
          "border-emerald-500/35 text-emerald-800 dark:text-emerald-300",
        impact === "maybe" &&
          "border-amber-500/35 text-amber-800 dark:text-amber-300",
        impact === "no" && "text-muted-foreground"
      )}
    >
      P&amp;L {impact}
    </Badge>
  );
}

export function CashFlowTypeBadge({ type }: { type: CashFlowType }) {
  return (
    <Badge variant="secondary" className="whitespace-nowrap font-normal">
      {cashFlowLabels[type]}
    </Badge>
  );
}
