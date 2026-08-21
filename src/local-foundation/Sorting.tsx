import {useMemo, useState} from 'react';
import {ArrowDown, ArrowUp, ArrowUpDown} from 'lucide-react';

export type SortDirection = 'asc' | 'desc';
export type SortKind = 'text' | 'number' | 'date';
export type SortValue = string | number | Date | null | undefined;

export interface SortColumn<T> {
  key: string;
  kind: SortKind;
  value: (row: T) => SortValue;
}

const faCollator = new Intl.Collator('fa', {numeric: true, sensitivity: 'base', ignorePunctuation: true});
const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

export function normalizeSortableNumber(value: SortValue): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NEGATIVE_INFINITY;
  const normalized = String(value ?? '')
    .replace(/[۰-۹]/g, (digit) => String(persianDigits.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String(arabicDigits.indexOf(digit)))
    .replace(/[٬,\s]/g, '')
    .replace(/[^\d.+-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : Number.NEGATIVE_INFINITY;
}

export function compareSortValues(left: SortValue, right: SortValue, kind: SortKind): number {
  const leftEmpty = left === null || left === undefined || left === '';
  const rightEmpty = right === null || right === undefined || right === '';
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1;
  if (kind === 'number') return normalizeSortableNumber(left) - normalizeSortableNumber(right);
  if (kind === 'date') {
    const leftTime = left instanceof Date ? left.getTime() : new Date(String(left)).getTime();
    const rightTime = right instanceof Date ? right.getTime() : new Date(String(right)).getTime();
    return (Number.isFinite(leftTime) ? leftTime : Number.NEGATIVE_INFINITY) - (Number.isFinite(rightTime) ? rightTime : Number.NEGATIVE_INFINITY);
  }
  return faCollator.compare(String(left), String(right));
}

export function sortRows<T>(rows: readonly T[], column: SortColumn<T>, direction: SortDirection): T[] {
  return rows.map((row, index) => ({row, index})).sort((a, b) => {
    const left = column.value(a.row); const right = column.value(b.row);
    const leftEmpty = left === null || left === undefined || left === '';
    const rightEmpty = right === null || right === undefined || right === '';
    if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? a.index - b.index : leftEmpty ? 1 : -1;
    const result = compareSortValues(left, right, column.kind);
    return result === 0 ? a.index - b.index : direction === 'asc' ? result : -result;
  }).map(({row}) => row);
}

export function useSortableRows<T>(rows: readonly T[], columns: readonly SortColumn<T>[], initialKey: string, initialDirection?: SortDirection) {
  const initialColumn = columns.find((column) => column.key === initialKey) ?? columns[0];
  const [sort, setSort] = useState<{key: string; direction: SortDirection}>(() => ({key: initialColumn?.key ?? '', direction: initialDirection ?? (initialColumn?.kind === 'text' ? 'asc' : 'desc')}));
  const activeColumn = columns.find((column) => column.key === sort.key) ?? initialColumn;
  const sortedRows = useMemo(() => activeColumn ? sortRows(rows, activeColumn, sort.direction) : [...rows], [rows, activeColumn, sort.direction]);
  const requestSort = (key: string) => {
    const column = columns.find((item) => item.key === key);
    if (!column) return;
    setSort((current) => current.key === key ? {...current, direction: current.direction === 'asc' ? 'desc' : 'asc'} : {key, direction: column.kind === 'text' ? 'asc' : 'desc'});
  };
  return {sortedRows, sort, requestSort};
}

export function SortHeader({columnKey, label, sort, onSort}: {columnKey: string; label: string; sort: {key: string; direction: SortDirection}; onSort: (key: string) => void}) {
  const active = sort.key === columnKey;
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown;
  const directionLabel = active ? (sort.direction === 'asc' ? 'صعودی' : 'نزولی') : 'بدون ترتیب';
  return <button type="button" className={`sort-header ${active ? 'sort-header--active' : ''}`} onClick={() => onSort(columnKey)} aria-label={`مرتب‌سازی ستون ${label}؛ وضعیت ${directionLabel}`} title={`مرتب‌سازی ${label}`}><span>{label}</span><Icon size={13} aria-hidden="true" /></button>;
}
