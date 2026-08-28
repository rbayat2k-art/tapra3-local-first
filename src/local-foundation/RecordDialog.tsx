import {useCallback, useEffect, useMemo, useRef, useState, type ReactNode} from 'react';
import {RecordDialogPortalContext} from './recordDialogPortal';

interface Props {
  ariaLabel: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function RecordDialog({ariaLabel, className = '', children, onClose}: Props) {
  const dialogRef = useRef<HTMLElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement>();
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const activeOverlayCloseRef = useRef<(() => void) | null>(null);
  onCloseRef.current = onClose;
  const assignDialogRef = useCallback((element: HTMLElement | null) => {
    dialogRef.current = element;
    setPortalTarget(element ?? undefined);
  }, []);
  const portalManager = useMemo(() => ({
    portalTarget,
    registerOverlay: (close: () => void) => {
      activeOverlayCloseRef.current = close;
      return () => {if (activeOverlayCloseRef.current === close) activeOverlayCloseRef.current = null;};
    },
  }), [portalTarget]);

  useEffect(() => {
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => {
      const first = dialog?.querySelector<HTMLElement>(FOCUSABLE);
      (first ?? dialog)?.focus();
    });
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (dialog.closest('.workspace-window--minimized')) return;
      const openDialogs=[...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')].filter((item)=>item.offsetParent!==null);
      if(openDialogs.at(-1)!==dialog)return;
      if (event.key === 'Escape') {
        event.preventDefault();
        if (activeOverlayCloseRef.current) {
          event.stopPropagation();
          const closeOverlay = activeOverlayCloseRef.current;
          activeOverlayCloseRef.current = null;
          closeOverlay();
          return;
        }
        const windowRoot = dialog.closest<HTMLElement>('.drawer-scrim, .modal-layer, .modal-scrim');
        if (windowRoot?.dataset.workspaceDirty === 'true') {
          event.stopPropagation();
          const closeButton = dialog.querySelector<HTMLButtonElement>('button[data-window-close], header button[aria-label*="بستن"]');
          closeButton?.click();
          return;
        }
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
        ...document.querySelectorAll<HTMLElement>('.global-operation-error button:not([disabled])'),
      ].filter((element) => element.offsetParent !== null);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      event.preventDefault();
      if (document.activeElement === dialog) {
        (event.shiftKey ? last : first).focus();
        return;
      }
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (activeIndex < 0) {
        first.focus();
        return;
      }
      const offset = event.shiftKey ? -1 : 1;
      focusable[(activeIndex + offset + focusable.length) % focusable.length].focus();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      restoreFocusRef.current?.focus();
    };
  }, []);

  return <RecordDialogPortalContext.Provider value={portalManager}>
    <div className="drawer-scrim" onMouseDown={(event) => {if (event.currentTarget === event.target) onClose();}}>
      <aside ref={assignDialogRef} className={`record-drawer ${className}`.trim()} role="dialog" aria-modal="true" aria-label={ariaLabel} tabIndex={-1}>
        {children}
      </aside>
    </div>
  </RecordDialogPortalContext.Provider>;
}
