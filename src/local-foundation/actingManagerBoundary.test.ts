import {afterEach,describe,expect,it,vi} from 'vitest';
import {createActingManagerBoundaryCheck,subscribeActingManagerBoundaryChecks} from './actingManagerBoundary';

describe('acting manager boundary watcher',()=>{
  afterEach(()=>vi.useRealTimers());

  it('refreshes once after a Tehran date boundary and preserves an unsaved local draft',async()=>{
    vi.useFakeTimers();
    const windowTarget=new EventTarget();
    const documentTarget=new EventTarget();
    let visible=true;
    let today='2026-08-28';
    let projectedState={revision:1};
    let localDraft='متن ذخیره‌نشده فرم';
    const lastDateRef={current:today};
    const inFlightRef:{current:Promise<void>|null}={current:null};
    const reconcile=vi.fn(async()=>({revision:projectedState.revision+1}));
    const check=createActingManagerBoundaryCheck({
      lastTehranDateRef:lastDateRef,
      inFlightRef,
      currentTehranDate:()=>today,
      reconcile,
      onState:(next)=>{projectedState=next;},
      onError:(cause)=>{throw cause;},
    });
    const dispose=subscribeActingManagerBoundaryChecks({
      windowTarget,documentTarget,documentIsVisible:()=>visible,check,
      setInterval:(callback,delay)=>setInterval(callback,delay),
      clearInterval:(timer)=>clearInterval(timer),intervalMs:60_000,
    });

    today='2026-08-29';
    await vi.advanceTimersByTimeAsync(60_000);
    expect(reconcile).toHaveBeenCalledTimes(1);
    expect(projectedState).toEqual({revision:2});
    expect(localDraft).toBe('متن ذخیره‌نشده فرم');

    windowTarget.dispatchEvent(new Event('focus'));
    windowTarget.dispatchEvent(new Event('pageshow'));
    documentTarget.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();
    expect(reconcile).toHaveBeenCalledTimes(1);

    visible=false;today='2026-08-30';documentTarget.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();expect(reconcile).toHaveBeenCalledTimes(1);
    visible=true;documentTarget.dispatchEvent(new Event('visibilitychange'));
    await Promise.resolve();await Promise.resolve();
    expect(reconcile).toHaveBeenCalledTimes(2);
    expect(projectedState).toEqual({revision:3});
    expect(localDraft).toBe('متن ذخیره‌نشده فرم');
    localDraft='ویرایش ادامه‌دار';
    expect(localDraft).toBe('ویرایش ادامه‌دار');
    dispose();
  });

  it('coalesces simultaneous focus and pageshow signals into one in-flight reconciliation',async()=>{
    const windowTarget=new EventTarget();const documentTarget=new EventTarget();
    let today='2026-08-28';const lastDateRef={current:today};const inFlightRef:{current:Promise<void>|null}={current:null};
    let resolve!:()=>void;const deferred=new Promise<void>((done)=>{resolve=done;});
    const reconcile=vi.fn(async()=>{await deferred;return 'fresh';});let state='old';
    const check=createActingManagerBoundaryCheck({lastTehranDateRef:lastDateRef,inFlightRef,currentTehranDate:()=>today,reconcile,onState:(next)=>{state=next;},onError:(cause)=>{throw cause;}});
    const dispose=subscribeActingManagerBoundaryChecks({windowTarget,documentTarget,documentIsVisible:()=>true,check,setInterval:()=>1,clearInterval:()=>undefined});
    today='2026-08-29';windowTarget.dispatchEvent(new Event('focus'));windowTarget.dispatchEvent(new Event('pageshow'));
    expect(reconcile).toHaveBeenCalledTimes(1);resolve();await inFlightRef.current;
    expect(state).toBe('fresh');expect(lastDateRef.current).toBe(today);dispose();
  });
});
