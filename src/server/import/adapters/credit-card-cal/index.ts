import type { ImportAdapter } from "../types";
import { isCalWorkbook, parseCalWorkbook } from "./parser";

export const creditCardCalAdapter: ImportAdapter = {
  key: "credit-card-cal",
  sourceType: "credit_card_cal",
  label: "CAL / Discount CAL",
  detect: isCalWorkbook,
  parse: parseCalWorkbook,
};
