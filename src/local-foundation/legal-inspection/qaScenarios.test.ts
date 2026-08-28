import {describe,expect,it} from 'vitest';
import {buildLegalQaScenarioBlueprints} from './qaScenarios';

describe('legal synthetic acceptance catalogue',()=>{
  it('builds exactly fifty deterministic scenarios without real banking or identity fields',()=>{
    const first=buildLegalQaScenarioBlueprints();const second=buildLegalQaScenarioBlueprints();expect(first).toHaveLength(50);expect(second).toEqual(first);expect(new Set(first.map((item)=>item.id)).size).toBe(50);expect(JSON.stringify(first)).not.toMatch(/nationalId|mobile|iban|cardNumber|accountNumber/);
  });
});
