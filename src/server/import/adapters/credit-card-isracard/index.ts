import type { ImportAdapter } from "../types";
import { isIsracardWorkbook, parseIsracardWorkbook } from "./parser";

export const creditCardIsracardAdapter: ImportAdapter = {
  key: "credit-card-isracard",
  sourceType: "credit_card_isracard",
  label: "Isracard",
  detect: isIsracardWorkbook,
  parse: parseIsracardWorkbook,
};
