import "server-only";

import { getDb } from "../index";
import { getDataQualitySummary } from "./data-quality";
import type {
  DataQualityDashboard,
  DataQualityExample,
  DataQualityRecommendedAction,
  DataQualitySprintBucket,
  ClassificationStatus,
  FinancialNature,
  NeedsReviewSourceBreakdown,
  RepeatedUnclassifiedPattern,
  UncertainPnlGroup,
  UnknownBusinessUnitGroup,
} from "@/lib/types";

const CLASSIFIED_STATUSES =
  "('manually_approved', 'auto_classified')";

interface QualityRow extends DataQualityExample {
  cleanDescription: string | null;
  sourceType: string | null;
  adapterKey: string | null;
  sourceSheetName: string | null;
  importBatchId: number | null;
  sourceFilename: string | null;
  categoryName: string | null;
  financialNature: FinancialNature;
  businessUnit: string | null;
  pnlImpact: string;
  classificationStatus: ClassificationStatus;
}

interface MutableGroup {
  count: number;
  amountSum: number;
  absoluteValue: number;
  rows: QualityRow[];
}

function normalizedCounterparty(row: QualityRow): string {
  return (
    row.counterparty?.trim() ||
    row.cleanDescription?.trim() ||
    row.description.trim() ||
    "Unknown description"
  )
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("he-IL");
}

function displayCounterparty(row: QualityRow): string {
  return (
    row.counterparty?.trim() ||
    row.cleanDescription?.trim() ||
    row.description.trim() ||
    "Unknown description"
  ).replace(/\s+/g, " ");
}

function asExample(row: QualityRow): DataQualityExample {
  return {
    id: row.id,
    date: row.date,
    description: row.description,
    counterparty: row.counterparty,
    amount: row.amount,
    sourceCategory: row.sourceCategory,
    legacyCategory: row.legacyCategory,
  };
}

function topExamples(rows: QualityRow[], limit = 3): DataQualityExample[] {
  return [...rows]
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
    .slice(0, limit)
    .map(asExample);
}

function addToGroup(
  groups: Map<string, MutableGroup>,
  key: string,
  row: QualityRow
): MutableGroup {
  const group = groups.get(key) ?? {
    count: 0,
    amountSum: 0,
    absoluteValue: 0,
    rows: [],
  };
  group.count += 1;
  group.amountSum += row.amount;
  group.absoluteValue += Math.abs(row.amount);
  group.rows.push(row);
  groups.set(key, group);
  return group;
}

function auditValues(
  rows: QualityRow[],
  field: "sourceCategory" | "legacyCategory"
): string[] {
  return [
    ...new Set(
      rows
        .map((row) => row[field]?.trim())
        .filter((value): value is string => Boolean(value))
    ),
  ].slice(0, 4);
}

function recommendationFor(
  label: string,
  count: number,
  directionCount: number,
  auditContextCount: number
): {
  action: DataQualityRecommendedAction;
  reason: string;
} {
  const normalized = label.toLocaleLowerCase("he-IL");
  const needsContext =
    /\b(bit|paybox)\b|העברה|משיכת מזומן|מזומן חוזר|תשלום/.test(
      normalized
    );
  const manualOnly =
    /pending|amazon|temu|apple\.com|מלון|בריכת|חוף|paypal(?!.*fiverr)/.test(
      normalized
    );

  if (needsContext) {
    return {
      action: "needs_user_context",
      reason:
        "The descriptor is a payment rail or transfer pattern; purpose and business unit are not reliable from text alone.",
    };
  }
  if (manualOnly) {
    return {
      action: "keep_review",
      reason:
        "The merchant or marketplace can represent different purposes, so these rows should stay contextual.",
    };
  }
  if (count >= 10 && directionCount === 1 && auditContextCount <= 1) {
    return {
      action: "create_rule_candidate",
      reason:
        "Repeated descriptor and consistent direction make this worth reviewing as a rule candidate; audit categories remain context only.",
    };
  }
  return {
    action: "classify_manually",
    reason:
      "The pattern repeats, but it should be reviewed as a batch before deciding whether a future rule is safe.",
  };
}

function makeSprintBucket(
  kind: DataQualitySprintBucket["kind"],
  title: string,
  description: string,
  patterns: RepeatedUnclassifiedPattern[]
): DataQualitySprintBucket {
  return {
    kind,
    title,
    description,
    transactionCount: patterns.reduce(
      (total, pattern) => total + pattern.count,
      0
    ),
    absoluteValue: patterns.reduce(
      (total, pattern) => total + pattern.absoluteValue,
      0
    ),
    patterns: patterns
      .slice(0, 5)
      .map((pattern) => pattern.normalizedCounterparty),
  };
}

export function getDataQualityDashboard(
  workspaceId: number
): DataQualityDashboard {
  const db = getDb();
  const coverage = getDataQualitySummary(workspaceId);
  const summaryDetails = db
    .prepare(
      `SELECT
         SUM(
           classification_status IN ${CLASSIFIED_STATUSES}
           AND (
             business_unit IS NULL
             OR business_unit = ''
             OR business_unit = 'unknown'
           )
         ) AS unknownBusinessUnitCount,
         SUM(
           classification_status IN ${CLASSIFIED_STATUSES}
           AND pnl_impact = 'maybe'
         ) AS uncertainPnlCount,
         SUM(category_id IS NULL) AS missingCategoryCount,
         SUM(
           financial_nature IS NULL
           OR financial_nature = 'unknown'
           OR cash_flow_type IS NULL
           OR cash_flow_type = 'unknown'
           OR pnl_impact IS NULL
         ) AS incompleteFinancialFieldsCount
       FROM transactions
       WHERE workspace_id = ?`
    )
    .get(workspaceId) as {
    unknownBusinessUnitCount: number;
    uncertainPnlCount: number;
    missingCategoryCount: number;
    incompleteFinancialFieldsCount: number;
  };
  const ruleCounts = db
    .prepare(
      `SELECT
         SUM(rule_source = 'user_approved') AS userApprovedRules,
         SUM(rule_source IN ('legacy_index', 'legacy_seed')) AS legacyRules
       FROM classification_rules
       WHERE workspace_id = ?`
    )
    .get(workspaceId) as {
    userApprovedRules: number;
    legacyRules: number;
  };

  const rows = db
    .prepare(
      `SELECT
         t.id,
         t.date,
         t.description,
         t.clean_description AS cleanDescription,
         t.counterparty,
         t.charged_amount AS amount,
         t.import_batch_id AS importBatchId,
         t.financial_nature AS financialNature,
         t.business_unit AS businessUnit,
         t.pnl_impact AS pnlImpact,
         t.classification_status AS classificationStatus,
         c.name AS categoryName,
         ir.source_type AS sourceType,
         ir.source_sheet_name AS sourceSheetName,
         ir.source_category AS sourceCategory,
         ir.legacy_category AS legacyCategory,
         ib.adapter_key AS adapterKey,
         ib.source_filename AS sourceFilename
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       LEFT JOIN import_rows ir ON ir.id = t.import_row_id
       LEFT JOIN import_batches ib ON ib.id = t.import_batch_id
       WHERE t.workspace_id = ?
         AND (
           t.classification_status = 'needs_review'
           OR (
             t.classification_status IN ${CLASSIFIED_STATUSES}
             AND (
               t.pnl_impact = 'maybe'
               OR t.business_unit IS NULL
               OR t.business_unit = ''
               OR t.business_unit = 'unknown'
             )
           )
         )
       ORDER BY ABS(t.charged_amount) DESC, t.id ASC`
    )
    .all(workspaceId) as QualityRow[];

  const reviewRows = rows.filter(
    (row) => row.classificationStatus === "needs_review"
  );

  const sourceGroups = new Map<
    string,
    MutableGroup & {
      sourceType: string;
      adapterKey: string | null;
      sourceSheetName: string | null;
      importBatchId: number | null;
      sourceFilename: string | null;
    }
  >();
  for (const row of reviewRows) {
    const key = [
      row.sourceType ?? "direct",
      row.adapterKey ?? "direct",
      row.sourceSheetName ?? "",
      row.importBatchId ?? "direct",
    ].join("|");
    const group = sourceGroups.get(key) ?? {
      count: 0,
      amountSum: 0,
      absoluteValue: 0,
      rows: [],
      sourceType: row.sourceType ?? "direct",
      adapterKey: row.adapterKey,
      sourceSheetName: row.sourceSheetName,
      importBatchId: row.importBatchId,
      sourceFilename: row.sourceFilename,
    };
    group.count += 1;
    group.amountSum += row.amount;
    group.absoluteValue += Math.abs(row.amount);
    group.rows.push(row);
    sourceGroups.set(key, group);
  }
  const needsReviewBySource: NeedsReviewSourceBreakdown[] = [
    ...sourceGroups.values(),
  ]
    .map((group) => {
      const largest = [...group.rows].sort(
        (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
      )[0];
      return {
        sourceType: group.sourceType,
        adapterKey: group.adapterKey,
        sourceSheetName: group.sourceSheetName,
        importBatchId: group.importBatchId,
        sourceFilename: group.sourceFilename,
        count: group.count,
        absoluteValue: group.absoluteValue,
        largestAmount: largest?.amount ?? 0,
        examples: topExamples(group.rows),
      };
    })
    .sort((a, b) => b.absoluteValue - a.absoluteValue);

  const unknownGroups = new Map<string, MutableGroup>();
  const uncertainGroups = new Map<string, MutableGroup>();
  for (const row of rows) {
    if (row.classificationStatus === "needs_review") continue;
    const unitUnknown =
      !row.businessUnit ||
      row.businessUnit === "unknown";
    if (unitUnknown) {
      addToGroup(
        unknownGroups,
        [
          row.categoryName ?? "No category",
          row.financialNature,
          normalizedCounterparty(row),
        ].join("|"),
        row
      );
    }
    if (row.pnlImpact === "maybe") {
      addToGroup(
        uncertainGroups,
        [
          row.financialNature,
          row.categoryName ?? "No category",
          row.businessUnit ?? "unknown",
        ].join("|"),
        row
      );
    }
  }

  const unknownBusinessUnits: UnknownBusinessUnitGroup[] = [
    ...unknownGroups.values(),
  ]
    .map((group) => ({
      categoryName: group.rows[0]?.categoryName ?? null,
      financialNature:
        group.rows[0]?.financialNature ?? "unknown",
      counterparty: displayCounterparty(group.rows[0]!),
      count: group.count,
      amountSum: group.amountSum,
      absoluteValue: group.absoluteValue,
      examples: topExamples(group.rows),
    }))
    .sort((a, b) => b.absoluteValue - a.absoluteValue);

  const uncertainPnl: UncertainPnlGroup[] = [
    ...uncertainGroups.values(),
  ]
    .map((group) => ({
      financialNature:
        group.rows[0]?.financialNature ?? "unknown",
      categoryName: group.rows[0]?.categoryName ?? null,
      businessUnit: group.rows[0]?.businessUnit ?? "unknown",
      count: group.count,
      amountSum: group.amountSum,
      absoluteValue: group.absoluteValue,
      examples: topExamples(group.rows),
    }))
    .sort((a, b) => b.absoluteValue - a.absoluteValue);

  const repeatedGroups = new Map<string, MutableGroup>();
  for (const row of reviewRows) {
    addToGroup(repeatedGroups, normalizedCounterparty(row), row);
  }
  const repeatedUnclassified: RepeatedUnclassifiedPattern[] = [
    ...repeatedGroups.entries(),
  ]
    .filter(([, group]) => group.count > 1)
    .map(([key, group]) => {
      const directionCount = new Set(
        group.rows.map((row) => Math.sign(row.amount))
      ).size;
      const sourceCategories = auditValues(group.rows, "sourceCategory");
      const legacyCategories = auditValues(group.rows, "legacyCategory");
      const recommendation = recommendationFor(
        key,
        group.count,
        directionCount,
        new Set([...sourceCategories, ...legacyCategories]).size
      );
      const sortedRows = [...group.rows].sort(
        (a, b) => Math.abs(b.amount) - Math.abs(a.amount)
      );
      return {
        normalizedCounterparty: displayCounterparty(group.rows[0]!),
        count: group.count,
        absoluteValue: group.absoluteValue,
        largestAmount: sortedRows[0]?.amount ?? 0,
        exampleDates: sortedRows.slice(0, 3).map((row) => row.date),
        exampleAmounts: sortedRows.slice(0, 3).map((row) => row.amount),
        sourceCategories,
        legacyCategories,
        recommendedAction: recommendation.action,
        recommendationReason: recommendation.reason,
      };
    })
    .sort(
      (a, b) =>
        b.count - a.count || b.absoluteValue - a.absoluteValue
    )
    .slice(0, 20);

  const highCount = repeatedUnclassified.filter(
    (pattern) =>
      pattern.count >= 8 &&
      !["needs_user_context", "keep_review"].includes(
        pattern.recommendedAction
      )
  );
  const highValueContext = repeatedUnclassified
    .filter(
      (pattern) =>
        pattern.recommendedAction === "needs_user_context" &&
        pattern.absoluteValue >= 1_000
    )
    .sort((a, b) => b.absoluteValue - a.absoluteValue);
  const ruleCandidates = repeatedUnclassified.filter(
    (pattern) => pattern.recommendedAction === "create_rule_candidate"
  );
  const manualPatterns = repeatedUnclassified.filter(
    (pattern) => pattern.recommendedAction === "keep_review"
  );

  return {
    summary: {
      ...coverage,
      userApprovedRules: ruleCounts.userApprovedRules ?? 0,
      legacyRules: ruleCounts.legacyRules ?? 0,
      unknownBusinessUnitCount:
        summaryDetails.unknownBusinessUnitCount ?? 0,
      uncertainPnlCount: summaryDetails.uncertainPnlCount ?? 0,
      missingCategoryCount: summaryDetails.missingCategoryCount ?? 0,
      incompleteFinancialFieldsCount:
        summaryDetails.incompleteFinancialFieldsCount ?? 0,
    },
    needsReviewBySource,
    unknownBusinessUnits,
    uncertainPnl,
    repeatedUnclassified,
    suggestedSprintBuckets: [
      makeSprintBucket(
        "high_count_low_ambiguity",
        "High count, low ambiguity",
        "Repeated descriptors with consistent direction. Review them together before applying any classification.",
        highCount
      ),
      makeSprintBucket(
        "high_value_needs_context",
        "High value, needs user context",
        "Transfer or payment-rail patterns where the financial purpose cannot be inferred safely.",
        highValueContext
      ),
      makeSprintBucket(
        "possible_rule_candidates",
        "Possible rule candidates",
        "Strong repeated patterns that may justify an explicit user-approved rule after manual confirmation.",
        ruleCandidates
      ),
      makeSprintBucket(
        "should_remain_manual",
        "Should remain manual",
        "Marketplace, travel, or leisure descriptors whose purpose can vary transaction by transaction.",
        manualPatterns
      ),
    ],
  };
}
