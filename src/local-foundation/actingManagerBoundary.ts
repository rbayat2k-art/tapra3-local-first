export interface MutableRef<T> {current:T}

interface ActingManagerBoundaryCheckOptions<T> {
  lastTehranDateRef: MutableRef<string>;
  inFlightRef: MutableRef<Promise<void> | null>;
  currentTehranDate: () => string;
  reconcile: () => Promise<T>;
  onState: (state:T) => void;
  onError: (cause:unknown) => void;
}

/**
 * Creates the narrow date-boundary check used by the mounted application.
 * The date advances only after a successful refresh, so a transient failure is
 * retried on the next timer/focus/visibility signal. Concurrent signals share
 * one promise and therefore cannot fan out duplicate reconciliation commands.
 */
export function createActingManagerBoundaryCheck<T>(options:ActingManagerBoundaryCheckOptions<T>) {
  return ():Promise<void> => {
    const currentDate=options.currentTehranDate();
    if(currentDate===options.lastTehranDateRef.current)return Promise.resolve();
    if(options.inFlightRef.current)return options.inFlightRef.current;
    const run=options.reconcile()
      .then((state)=>{
        options.lastTehranDateRef.current=currentDate;
        options.onState(state);
      })
      .catch((cause)=>{
        options.onError(cause);
      })
      .finally(()=>{
        if(options.inFlightRef.current===run)options.inFlightRef.current=null;
      });
    options.inFlightRef.current=run;
    return run;
  };
}

interface EventSource {
  addEventListener(type:string,listener:EventListener):void;
  removeEventListener(type:string,listener:EventListener):void;
}

interface BoundarySubscriptionOptions<TTimer> {
  windowTarget:EventSource;
  documentTarget:EventSource;
  documentIsVisible:()=>boolean;
  check:()=>Promise<void>;
  setInterval:(callback:()=>void,delayMs:number)=>TTimer;
  clearInterval:(timer:TTimer)=>void;
  intervalMs?:number;
}

/** Subscribe without remounting any workspace UI or touching local form state. */
export function subscribeActingManagerBoundaryChecks<TTimer>(options:BoundarySubscriptionOptions<TTimer>):()=>void {
  const request=()=>{void options.check();};
  const onVisibility=()=>{if(options.documentIsVisible())request();};
  options.windowTarget.addEventListener('focus',request);
  options.windowTarget.addEventListener('pageshow',request);
  options.documentTarget.addEventListener('visibilitychange',onVisibility);
  const timer=options.setInterval(request,options.intervalMs??60_000);
  return ()=>{
    options.windowTarget.removeEventListener('focus',request);
    options.windowTarget.removeEventListener('pageshow',request);
    options.documentTarget.removeEventListener('visibilitychange',onVisibility);
    options.clearInterval(timer);
  };
}
