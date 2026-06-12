import type { ImportAdapter } from "../types";
import {
  isBankCheckingHebrewWorkbook,
  parseBankCheckingHebrewWorkbook,
} from "./parser";

export const bankCheckingHebrewAdapter: ImportAdapter = {
  key: "bank-checking-hebrew",
  sourceType: "bank_checking_account",
  label: "Hebrew bank checking account",
  detect: isBankCheckingHebrewWorkbook,
  parse: parseBankCheckingHebrewWorkbook,
};
