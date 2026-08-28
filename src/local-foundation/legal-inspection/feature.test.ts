import {afterEach,describe,expect,it} from 'vitest';
import {assertLegalSyntheticPrototypeEnabled,legalSyntheticPrototypeEnabled} from './feature';

const originalLocation=Object.getOwnPropertyDescriptor(globalThis,'location');
afterEach(()=>{if(originalLocation)Object.defineProperty(globalThis,'location',originalLocation);else delete (globalThis as {location?:Location}).location;});

describe('legal local synthetic feature gate',()=>{
  it('allows local/test execution',()=>{expect(legalSyntheticPrototypeEnabled()).toBe(true);expect(()=>assertLegalSyntheticPrototypeEnabled()).not.toThrow();});
  it('fails closed on a non-local browser host',()=>{Object.defineProperty(globalThis,'location',{value:{hostname:'erp.example.invalid'},configurable:true});expect(legalSyntheticPrototypeEnabled()).toBe(false);expect(()=>assertLegalSyntheticPrototypeEnabled()).toThrow('فقط در محیط محلی');});
});
