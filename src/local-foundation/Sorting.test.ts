import {describe, expect, it} from 'vitest';
import {normalizeSortableNumber, sortRows, type SortColumn} from './Sorting';

interface Row {id: string; value?: string | number;}

describe('local table sorting', () => {
  it('sorts Persian text alphabetically', () => {
    const rows: Row[] = [{id:'3',value:'پشتیبانی'},{id:'1',value:'انبار'},{id:'2',value:'بازاریابی'}];
    const column: SortColumn<Row> = {key:'value',kind:'text',value:(row)=>row.value};
    expect(sortRows(rows,column,'asc').map((row)=>row.id)).toEqual(['1','2','3']);
  });

  it('sorts Persian and Latin numbers by numeric value', () => {
    expect(normalizeSortableNumber('۱٬۲۵۰')).toBe(1250);
    const rows: Row[] = [{id:'small',value:'۹'},{id:'large',value:'۱۲۰'},{id:'middle',value:35}];
    const column: SortColumn<Row> = {key:'value',kind:'number',value:(row)=>row.value};
    expect(sortRows(rows,column,'desc').map((row)=>row.id)).toEqual(['large','middle','small']);
  });

  it('sorts dates newest first and keeps empty cells last', () => {
    const rows: Row[] = [{id:'old',value:'2025-01-01'},{id:'empty'},{id:'new',value:'2026-08-18'}];
    const column: SortColumn<Row> = {key:'value',kind:'date',value:(row)=>row.value};
    expect(sortRows(rows,column,'desc').map((row)=>row.id)).toEqual(['new','old','empty']);
  });
});
