import "server-only";

import { getDb } from "../index";
import type {
  ImportRow,
  ImportRowStatus,
  ClassificationStatus,
  FinancialNature,
  CashFlowType,
  PnlImpact,
  RuleSource,
} from "@/lib/types";

const ROW_COLUMNS = `
  r.id,
  r.batch_id              as batchId,
  r.workspace_id          as workspaceId,
  r.raw_row_number        as rawRowNumber,
  r.raw_date              as rawDate,
  r.raw_amount            as rawAmount,
  r.raw_description       as rawDescription,
  r.raw_account           as rawAccount,
  r.raw_balance           as rawBalance,
  r.raw_metadata          as rawMetadata,
  r.date,
  r.amount,
  r.direction,
  r.account,
  r.counterparty,
  r.clean_description     as cleanDescription,
  r.category_id           as categoryId,
  r.business_unit         as businessUnit,
  r.financial_nature      as financialNature,
  r.cash_flow_type        as cashFlowType,
  r.pnl_impact            as pnlImpact,
  r.classification_status as classificationStatus,
  r.confidence_score      as confidenceScore,
  r.ai_explanation        as aiExplanation,
  r.applied_rule_id       as appliedRuleId,
  r.applied_rule_confidence as appliedRuleConfidence,
  r.applied_rule_at       as appliedRuleAt,
  r.applied_rule_source   as appliedRuleSource,
  r.dedup_hash            as dedupHash,
  r.is_duplicate          as isDuplicate,
  r.duplicate_of_transaction_id as duplicateOfTransactionId,
  r.import_status         as importStatus,
  r.transaction_id        as transactionId,
  r.legacy_category       as legacyCategory,
  r.legacy_rule_category  as legacyRuleCategory,
  r.source_sheet_name     as sourceSheetName,
  r.notes,
  r.source_type           as sourceType,
  r.source_section        as sourceSection,
  r.billing_date          as billingDate,
  r.card_last4            as cardLast4,
  r.digital_wallet_card_id as digitalWalletCardId,
  r.voucher_number        as voucherNumber,
  r.original_amount       as originalAmount,
  r.original_currency     as originalCurrency,
  r.fx_rate               as fxRate,
  r.transaction_type      as transactionType,
  r.payment_channel       as paymentChannel,
  r.source_category       as sourceCategory,
  r.currency,
  r.transaction_status    as transactionStatus,
  r.value_date            as valueDate,
  r.balance_after         as balanceAfter,
  r.reference,
  r.bank_account_label    as bankAccountLabel,
  r.bank_account_number_masked as bankAccountNumberMasked,
  r.source_bank           as sourceBank,
  r.created_at            as createdAt,
  r.updated_at            as updatedAt
`.trim();

function hydrate(row: Record<string, unknown>): ImportRow {
  return {
    ...row,
    isDuplicate: Boolean(row.isDuplicate),
    rawMetadata: row.rawMetadata
      ? (JSON.parse(row.rawMetadata as string) as Record<string, unknown>)
      : null,
  } as unknown as ImportRow;
}

function enrichDuplicateDetails(rows: ImportRow[]): ImportRow[] {
  const duplicateRows = rows.filter((row) => row.isDuplicate && row.dedupHash);
  if (duplicateRows.length === 0) {
    return rows.map((row) => ({
      ...row,
      duplicateReason: null,
      duplicateMatch: null,
      nextDedupSequence: null,
      canImportDuplicate: false,
    }));
  }

  const workspaceId = duplicateRows[0].workspaceId;
  const hashes = [...new Set(duplicateRows.map((row) => row.dedupHash as string))];
  type MatchRow = {
    id: number;
    date: string;
    description: string;
    amount: number;
    dedupHash: string;
    dedupSequence: number;
  };
  const matches: MatchRow[] = [];
  for (let start = 0; start < hashes.length; start += 400) {
    const hashChunk = hashes.slice(start, start + 400);
    const placeholders = hashChunk.map(() => "?").join(", ");
    matches.push(
      ...(getDb()
        .prepare(
          `SELECT id, date, description, charged_amount as amount,
                  dedup_hash as dedupHash, dedup_sequence as dedupSequence
           FROM transactions
           WHERE workspace_id = ? AND dedup_hash IN (${placeholders})
           ORDER BY dedup_hash, dedup_sequence, id`
        )
        .all(workspaceId, ...hashChunk) as MatchRow[])
    );
  }

  const firstMatchByHash = new Map<string, (typeof matches)[number]>();
  const maxSequenceByHash = new Map<string, number>();
  for (const match of matches) {
    if (!firstMatchByHash.has(match.dedupHash)) {
      firstMatchByHash.set(match.dedupHash, match);
    }
    maxSequenceByHash.set(
      match.dedupHash,
      Math.max(maxSequenceByHash.get(match.dedupHash) ?? -1, match.dedupSequence)
    );
  }

  return rows.map((row) => {
    const match = row.dedupHash ? firstMatchByHash.get(row.dedupHash) : undefined;
    return {
      ...row,
      duplicateReason: row.isDuplicate ? "Exact dedup hash match" : null,
      duplicateMatch: match
        ? {
            id: match.id,
            date: match.date,
            description: match.description,
            amount: match.amount,
            dedupSequence: match.dedupSequence,
          }
        : null,
      nextDedupSequence:
        row.dedupHash && maxSequenceByHash.has(row.dedupHash)
          ? (maxSequenceByHash.get(row.dedupHash) as number) + 1
          : row.isDuplicate
            ? 0
            : null,
      canImportDuplicate: Boolean(
        row.isDuplicate && row.date && row.amount != null && row.dedupHash
      ),
    };
  });
}

export function insertImportRow(
  batchId: number,
  workspaceId: number,
  data: {
    rawRowNumber: number;
    rawDate?: string | null;
    rawAmount?: string | null;
    rawDescription?: string | null;
    rawAccount?: string | null;
    rawBalance?: string | null;
    rawMetadata?: Record<string, unknown> | null;
    legacyCategory?: string | null;
    legacyRuleCategory?: string | null;
    sourceSheetName?: string | null;
    sourceType: ImportRow["sourceType"];
    sourceSection?: string | null;
    billingDate?: string | null;
    cardLast4?: string | null;
    digitalWalletCardId?: string | null;
    voucherNumber?: string | null;
    originalAmount?: number | null;
    originalCurrency?: string | null;
    fxRate?: number | null;
    transactionType?: string | null;
    paymentChannel?: string | null;
    sourceCategory?: string | null;
    currency?: string | null;
    transactionStatus?: "completed" | "pending";
    valueDate?: string | null;
    balanceAfter?: number | null;
    reference?: string | null;
    bankAccountLabel?: string | null;
    bankAccountNumberMasked?: string | null;
    sourceBank?: string | null;
    notes?: string | null;
  }
): ImportRow {
  const row = getDb()
    .prepare(
      `INSERT INTO import_rows (
         batch_id, workspace_id,
         raw_row_number, raw_date, raw_amount, raw_description,
         raw_account, raw_balance, raw_metadata,
         legacy_category, legacy_rule_category, source_sheet_name, notes,
         source_type, source_section, billing_date, card_last4,
         digital_wallet_card_id, voucher_number,
         original_amount, original_currency, fx_rate,
         transaction_type, payment_channel, source_category,
         currency, transaction_status,
         value_date, balance_after, reference,
         bank_account_label, bank_account_number_masked, source_bank
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         ?, ?, ?, ?, ?, ?
       )
       RETURNING ${ROW_COLUMNS.replace(/r\./g, "")}`
    )
    .get(
      batchId,
      workspaceId,
      data.rawRowNumber,
      data.rawDate ?? null,
      data.rawAmount ?? null,
      data.rawDescription ?? null,
      data.rawAccount ?? null,
      data.rawBalance ?? null,
      data.rawMetadata ? JSON.stringify(data.rawMetadata) : null,
      data.legacyCategory ?? null,
      data.legacyRuleCategory ?? null,
      data.sourceSheetName ?? null,
      data.notes ?? null,
      data.sourceType,
      data.sourceSection ?? null,
      data.billingDate ?? null,
      data.cardLast4 ?? null,
      data.digitalWalletCardId ?? null,
      data.voucherNumber ?? null,
      data.originalAmount ?? null,
      data.originalCurrency ?? null,
      data.fxRate ?? null,
      data.transactionType ?? null,
      data.paymentChannel ?? null,
      data.sourceCategory ?? null,
      data.currency ?? null,
      data.transactionStatus ?? "completed",
      data.valueDate ?? null,
      data.balanceAfter ?? null,
      data.reference ?? null,
      data.bankAccountLabel ?? null,
      data.bankAccountNumberMasked ?? null,
      data.sourceBank ?? null
    ) as Record<string, unknown>;
  return hydrate(row);
}

export function updateImportRowNotes(
  workspaceId: number,
  rowId: number,
  notes: string | null
): void {
  getDb()
    .prepare(
      `UPDATE import_rows SET notes = ?, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`
    )
    .run(notes, workspaceId, rowId);
}

export function listImportRows(
  workspaceId: number,
  batchId: number,
  filter?: { importStatus?: ImportRowStatus; classificationStatus?: ClassificationStatus }
): ImportRow[] {
  const conditions = ["r.workspace_id = ?", "r.batch_id = ?"];
  const params: unknown[] = [workspaceId, batchId];
  if (filter?.importStatus) { conditions.push("r.import_status = ?"); params.push(filter.importStatus); }
  if (filter?.classificationStatus) { conditions.push("r.classification_status = ?"); params.push(filter.classificationStatus); }
  const rows = getDb()
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM import_rows r
       WHERE ${conditions.join(" AND ")}
       ORDER BY r.raw_row_number ASC`
    )
    .all(...params) as Record<string, unknown>[];
  return enrichDuplicateDetails(rows.map(hydrate));
}

export function getImportRow(workspaceId: number, rowId: number): ImportRow | null {
  const row = getDb()
    .prepare(
      `SELECT ${ROW_COLUMNS} FROM import_rows r
       WHERE r.workspace_id = ? AND r.id = ?`
    )
    .get(workspaceId, rowId) as Record<string, unknown> | undefined;
  return row ? enrichDuplicateDetails([hydrate(row)])[0] : null;
}

export function updateImportRowNormalized(
  workspaceId: number,
  rowId: number,
  data: {
    date?: string | null;
    amount?: number | null;
    direction?: string | null;
    account?: string | null;
    counterparty?: string | null;
    cleanDescription?: string | null;
    categoryId?: number | null;
    businessUnit?: string | null;
  }
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if ("date" in data) { sets.push("date = ?"); params.push(data.date ?? null); }
  if ("amount" in data) { sets.push("amount = ?"); params.push(data.amount ?? null); }
  if ("direction" in data) { sets.push("direction = ?"); params.push(data.direction ?? null); }
  if ("account" in data) { sets.push("account = ?"); params.push(data.account ?? null); }
  if ("counterparty" in data) { sets.push("counterparty = ?"); params.push(data.counterparty ?? null); }
  if ("cleanDescription" in data) { sets.push("clean_description = ?"); params.push(data.cleanDescription ?? null); }
  if ("categoryId" in data) { sets.push("category_id = ?"); params.push(data.categoryId ?? null); }
  if ("businessUnit" in data) { sets.push("business_unit = ?"); params.push(data.businessUnit ?? null); }
  if (sets.length === 0) return;
  params.push(workspaceId, rowId);
  getDb()
    .prepare(`UPDATE import_rows SET ${sets.join(", ")}, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`)
    .run(...params);
}

export function updateImportRowClassification(
  workspaceId: number,
  rowId: number,
  data: {
    financialNature?: FinancialNature;
    cashFlowType?: CashFlowType;
    pnlImpact?: PnlImpact;
    classificationStatus?: ClassificationStatus;
    confidenceScore?: number | null;
    aiExplanation?: string | null;
  }
): void {
  const sets: string[] = [];
  const params: unknown[] = [];
  if (data.financialNature !== undefined) { sets.push("financial_nature = ?"); params.push(data.financialNature); }
  if (data.cashFlowType !== undefined) { sets.push("cash_flow_type = ?"); params.push(data.cashFlowType); }
  if (data.pnlImpact !== undefined) { sets.push("pnl_impact = ?"); params.push(data.pnlImpact); }
  if (data.classificationStatus !== undefined) { sets.push("classification_status = ?"); params.push(data.classificationStatus); }
  if ("confidenceScore" in data) { sets.push("confidence_score = ?"); params.push(data.confidenceScore ?? null); }
  if ("aiExplanation" in data) { sets.push("ai_explanation = ?"); params.push(data.aiExplanation ?? null); }
  if (sets.length === 0) return;
  params.push(workspaceId, rowId);
  getDb()
    .prepare(`UPDATE import_rows SET ${sets.join(", ")}, updated_at = datetime('now') WHERE workspace_id = ? AND id = ?`)
    .run(...params);
}

export function setImportRowRuleProvenance(
  workspaceId: number,
  rowId: number,
  data: {
    appliedRuleId: number;
    appliedRuleConfidence: number;
    appliedRuleSource: RuleSource;
  }
): void {
  getDb()
    .prepare(
      `UPDATE import_rows
       SET applied_rule_id = ?,
           applied_rule_confidence = ?,
           applied_rule_at = datetime('now'),
           applied_rule_source = ?,
           updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(
      data.appliedRuleId,
      data.appliedRuleConfidence,
      data.appliedRuleSource,
      workspaceId,
      rowId
    );
}

export function markImportRowDedup(
  workspaceId: number,
  rowId: number,
  dedupHash: string,
  isDuplicate: boolean,
  duplicateOfTransactionId: number | null
): void {
  getDb()
    .prepare(
      `UPDATE import_rows
       SET dedup_hash = ?, is_duplicate = ?, duplicate_of_transaction_id = ?,
           import_status = CASE WHEN ? = 1 THEN 'pending_duplicate' ELSE import_status END,
           updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(
      dedupHash,
      isDuplicate ? 1 : 0,
      duplicateOfTransactionId,
      isDuplicate ? 1 : 0,
      workspaceId,
      rowId
    );
}

export function commitImportRow(
  workspaceId: number,
  rowId: number,
  transactionId: number
): void {
  getDb()
    .prepare(
      `UPDATE import_rows
       SET import_status = 'imported', transaction_id = ?, updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(transactionId, workspaceId, rowId);
}

export function rejectImportRow(workspaceId: number, rowId: number): void {
  getDb()
    .prepare(
      `UPDATE import_rows
       SET import_status = 'rejected', updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(workspaceId, rowId);
}

export function markImportRowPendingDuplicate(
  workspaceId: number,
  rowId: number,
  duplicateOfTransactionId: number | null
): void {
  getDb()
    .prepare(
      `UPDATE import_rows
       SET is_duplicate = 1,
           duplicate_of_transaction_id = COALESCE(?, duplicate_of_transaction_id),
           import_status = 'pending_duplicate',
           updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(duplicateOfTransactionId, workspaceId, rowId);
}

export function markImportRowSkippedDuplicate(
  workspaceId: number,
  rowId: number
): void {
  getDb()
    .prepare(
      `UPDATE import_rows
       SET import_status = 'skipped_duplicate', updated_at = datetime('now')
       WHERE workspace_id = ? AND id = ?`
    )
    .run(workspaceId, rowId);
}

export function countNeedsReview(workspaceId: number, batchId: number): number {
  const result = getDb()
    .prepare(
      `SELECT COUNT(*) as n FROM import_rows
       WHERE workspace_id = ? AND batch_id = ? AND classification_status = 'needs_review'`
    )
    .get(workspaceId, batchId) as { n: number };
  return result.n;
}
