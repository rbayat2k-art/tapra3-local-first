import type {SalesHierarchyLevel} from './model';

export const SALES_POSITION_BY_LEVEL: Record<SalesHierarchyLevel, string> = {
  sales_vice: 'position-sales-vice',
  sales_manager: 'position-sales-manager',
  senior_supervisor: 'position-sales-senior-supervisor',
  sales_supervisor: 'position-sales-supervisor',
  seller: 'position-seller',
};

export function positionIdForSalesHierarchy(level?: SalesHierarchyLevel): string | undefined {
  return level ? SALES_POSITION_BY_LEVEL[level] : undefined;
}
