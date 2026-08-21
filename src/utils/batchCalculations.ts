import { RequestBatchItem } from '../types';
import { numberToPersianWords } from './numberToWords';

export interface BatchTotalsResult {
  total: number;
  amountInWords: string;
  allRejected: boolean; // every row is 'rejected' — request should auto-move to 'rejected'
  hasPending: boolean;  // at least one row still 'pending' — no final approval/forward yet
}

// Pure recalculation of a batch request's total, per business rules:
// 1. 'pending' rows never contribute to the total.
// 2. 'rejected' rows never contribute to the total.
// 3. total = sum of currentAmount (falls back to amount) over 'approved' rows only.
// Call this after every row decision or row-amount correction — the caller (RequestDetailModal)
// writes the result back onto request.amount/amountInWords.
export function computeBatchTotals(batchItems: RequestBatchItem[]): BatchTotalsResult {
  const approvedRows = batchItems.filter((i) => i.status === 'approved');
  const total = approvedRows.reduce((sum, i) => sum + (i.currentAmount ?? i.amount), 0);
  const allRejected = batchItems.length > 0 && batchItems.every((i) => i.status === 'rejected');
  const hasPending = batchItems.some((i) => i.status === 'pending');
  return { total, amountInWords: numberToPersianWords(total), allRejected, hasPending };
}

// Rule 6/7: while ANY row is still 'pending', no final approval/forward may proceed for a
// batch request. Non-batch requests (undefined/empty batchItems) are always unaffected.
// This must be re-checked at the START of the relevant handler, not just used to disable a
// button — the same function backs both the UI disabled-state and the handler guard.
export function canFinalizeBatch(batchItems: RequestBatchItem[] | undefined): boolean {
  if (!batchItems || batchItems.length === 0) return true;
  return !batchItems.some((i) => i.status === 'pending');
}

// Applies an amount correction to one row, recording the change in its changeHistory and
// setting the correction-audit fields — never silently overwrites without a trail.
export function applyRowAmountCorrection(
  item: RequestBatchItem,
  newAmount: number,
  reason: string,
  byUserId: string,
  byName: string,
  at: string
): RequestBatchItem {
  const oldAmount = item.currentAmount ?? item.amount;
  if (newAmount === oldAmount) return item;
  return {
    ...item,
    amount: newAmount,
    currentAmount: newAmount,
    originalAmount: item.originalAmount ?? item.amount,
    amountCorrectedByUserId: byUserId,
    amountCorrectedByName: byName,
    amountCorrectedAt: at,
    amountCorrectionReason: reason,
    changeHistory: [
      ...(item.changeHistory || []),
      { field: 'amount', oldValue: String(oldAmount), newValue: String(newAmount), byUserId, byName, at }
    ]
  };
}
