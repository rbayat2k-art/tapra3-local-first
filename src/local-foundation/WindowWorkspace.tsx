import {useCallback, useEffect, useRef, useState, type ReactNode} from 'react';
import {AlertTriangle, Layers3, Maximize2, X} from 'lucide-react';

interface OpenWindowEntry {
  id: string;
  title: string;
  root: HTMLElement;
  minimized: boolean;
  pageTabId?: string;
}

const WINDOW_ROOT_SELECTOR = '.modal-layer, .drawer-scrim, .modal-scrim:has(> .dialog)';
const CLOSE_LABELS = new Set(['بستن', 'انصراف', 'بستن پنجره']);

function windowRoot(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;
  return target.closest<HTMLElement>(WINDOW_ROOT_SELECTOR);
}

function windowTitle(root: HTMLElement) {
  const dialog = root.matches('[role="dialog"]') ? root : root.querySelector<HTMLElement>('[role="dialog"], .dialog, .modal-card, .record-drawer');
  return dialog?.getAttribute('aria-label')
    ?? dialog?.querySelector('h2')?.textContent?.trim()
    ?? root.querySelector('h2')?.textContent?.trim()
    ?? 'فرم باز';
}

function isBackdrop(root: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  if (target === root) return true;
  return root.classList.contains('modal-layer')
    && target.classList.contains('modal-scrim')
    && target.parentElement === root;
}

function closeControl(root: HTMLElement) {
  const labelled = root.querySelector<HTMLButtonElement>(
    'button[data-window-close], button[aria-label*="بستن"]:not(.modal-scrim)',
  );
  if (labelled) return labelled;
  const headerClose = root.querySelector<HTMLButtonElement>('header > .icon-button, .modal-heading > .icon-button');
  if (headerClose) return headerClose;
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find((button) => CLOSE_LABELS.has(button.textContent?.trim() ?? '')) ?? null;
}

function isCloseControl(root: HTMLElement, target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  const button = target.closest<HTMLButtonElement>('button');
  if (!button || button.classList.contains('modal-scrim')) return false;
  return button.hasAttribute('data-window-close')
    || button.getAttribute('aria-label')?.includes('بستن') === true
    || (button.classList.contains('icon-button') && Boolean(button.closest('header, .modal-heading')))
    || CLOSE_LABELS.has(button.textContent?.trim() ?? '');
}

function setWindowVisibility(root: HTMLElement, visible: boolean) {
  root.classList.toggle('workspace-window--minimized', !visible);
  root.toggleAttribute('inert', !visible);
  if (visible) root.removeAttribute('aria-hidden');
  else root.setAttribute('aria-hidden', 'true');
}

export function WindowWorkspaceProvider({children}: {children: ReactNode}) {
  const [entries, setEntries] = useState<OpenWindowEntry[]>([]);
  const [pendingDiscardId, setPendingDiscardId] = useState<string | null>(null);
  const [tabCloseBlocked, setTabCloseBlocked] = useState(false);
  const idByRoot = useRef(new WeakMap<HTMLElement, string>());
  const sequence = useRef(0);

  const entryId = useCallback((root: HTMLElement) => {
    const previous = idByRoot.current.get(root);
    if (previous) return previous;
    sequence.current += 1;
    const id = `workspace-window-${sequence.current}`;
    idByRoot.current.set(root, id);
    return id;
  }, []);

  const registerDirty = useCallback((root: HTMLElement) => {
    const id = entryId(root);
    root.dataset.workspaceDirty = 'true';
    setEntries((current) => {
      const existing = current.find((entry) => entry.root === root);
      if (existing) {
        const title = windowTitle(root);
        return current.map((entry) => entry.root === root ? {...entry, title} : entry);
      }
      const pageTabId = root.closest<HTMLElement>('[data-workspace-page-id]')?.dataset.workspacePageId;
      return [...current, {id, title: windowTitle(root), root, minimized: false, pageTabId}];
    });
  }, [entryId]);

  const minimize = useCallback((root: HTMLElement) => {
    registerDirty(root);
    setWindowVisibility(root, false);
    setEntries((current) => current.map((entry) => entry.root === root ? {...entry, minimized: true} : entry));
    window.setTimeout(() => {
      document.querySelector<HTMLButtonElement>(`[data-window-tab="${idByRoot.current.get(root) ?? ''}"]`)?.focus();
      if (!document.querySelector(`${WINDOW_ROOT_SELECTOR}:not(.workspace-window--minimized)`)) document.body.style.overflow = '';
    }, 0);
  }, [registerDirty]);

  const restore = useCallback((entry: OpenWindowEntry) => {
    if (!entry.root.isConnected) return;
    setTabCloseBlocked(false);
    if (entry.pageTabId) {
      window.dispatchEvent(new CustomEvent('workspace:request-tab-activation', {detail: {tabId: entry.pageTabId}}));
    }
    setWindowVisibility(entry.root, true);
    setEntries((current) => current.map((item) => item.id === entry.id ? {...item, minimized: false} : item));
    document.body.style.overflow = 'hidden';
    window.setTimeout(() => {
      const dialog = entry.root.matches('[role="dialog"]') ? entry.root : entry.root.querySelector<HTMLElement>('[role="dialog"], .dialog, .modal-card, .record-drawer');
      const focusable = dialog?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])');
      (focusable ?? dialog)?.focus();
    }, 30);
  }, []);

  const discard = useCallback((entry: OpenWindowEntry) => {
    const control = closeControl(entry.root);
    entry.root.dataset.workspaceDiscard = 'true';
    entry.root.dataset.workspaceDirty = 'false';
    setWindowVisibility(entry.root, true);
    setEntries((current) => current.filter((item) => item.id !== entry.id));
    setPendingDiscardId(null);
    setTabCloseBlocked(false);
    window.setTimeout(() => {
      control?.click();
      delete entry.root.dataset.workspaceDiscard;
    }, 0);
  }, []);

  useEffect(() => {
    const handleInput = (event: Event) => {
      const root = windowRoot(event.target);
      if (!root || root.dataset.workspaceDiscard === 'true') return;
      const control = event.target;
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement || control instanceof HTMLSelectElement) {
        const readOnly = control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement ? control.readOnly : false;
        if (control.disabled || readOnly || control.hasAttribute('data-window-ignore-dirty')) return;
      }
      registerDirty(root);
    };

    const handleMouseDown = (event: MouseEvent) => {
      const root = windowRoot(event.target);
      if (!root || !isBackdrop(root, event.target)) return;
      if (root.dataset.workspaceDirty === 'true') {
        event.preventDefault();
        event.stopImmediatePropagation();
        minimize(root);
        return;
      }
      if (root.classList.contains('modal-scrim')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        window.setTimeout(() => closeControl(root)?.click(), 0);
      }
    };

    const handleClick = (event: MouseEvent) => {
      const root = windowRoot(event.target);
      if (!root || root.dataset.workspaceDiscard === 'true' || root.dataset.workspaceDirty !== 'true' || !isCloseControl(root, event.target)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      minimize(root);
    };

    const observer = new MutationObserver(() => {
      setEntries((current) => current.filter((entry) => entry.root.isConnected));
    });
    observer.observe(document.body, {childList: true, subtree: true});
    document.addEventListener('input', handleInput, true);
    document.addEventListener('change', handleInput, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('click', handleClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('input', handleInput, true);
      document.removeEventListener('change', handleInput, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('click', handleClick, true);
    };
  }, [minimize, registerDirty]);

  useEffect(() => {
    document.body.classList.toggle('has-open-window-bar', entries.length > 0);
    return () => document.body.classList.remove('has-open-window-bar');
  }, [entries.length]);

  useEffect(() => {
    const handleBlockedTabClose = () => setTabCloseBlocked(true);
    const handleActiveTabChanged = (event: Event) => {
      const tabId = (event as CustomEvent<{tabId?: string}>).detail?.tabId;
      window.setTimeout(() => {
        const activePanel = Array.from(document.querySelectorAll<HTMLElement>('[data-workspace-page-id]'))
          .find((panel) => panel.dataset.workspacePageId === tabId);
        const openModal = activePanel?.querySelector<HTMLElement>(`${WINDOW_ROOT_SELECTOR}:not(.workspace-window--minimized)`);
        document.body.style.overflow = openModal ? 'hidden' : '';
      }, 0);
    };
    window.addEventListener('workspace:tab-close-blocked', handleBlockedTabClose);
    window.addEventListener('workspace:active-tab-changed', handleActiveTabChanged);
    return () => {
      window.removeEventListener('workspace:tab-close-blocked', handleBlockedTabClose);
      window.removeEventListener('workspace:active-tab-changed', handleActiveTabChanged);
    };
  }, []);

  useEffect(() => {
    if (!entries.length) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warnBeforeUnload);
    return () => window.removeEventListener('beforeunload', warnBeforeUnload);
  }, [entries.length]);

  const pendingDiscard = entries.find((entry) => entry.id === pendingDiscardId);

  return <>
    {children}
    {entries.length > 0 && <section className="workspace-window-bar" aria-label="پنجره‌های باز">
      <div className="workspace-window-bar__heading"><Layers3 size={18}/><span><strong>پنجره‌های باز</strong><small>تغییرات شما حفظ شده‌اند</small></span></div>
      <div className="workspace-window-tabs" aria-label="فرم‌های دارای تغییر ذخیره‌نشده">
        {entries.map((entry) => <div className={`workspace-window-tab ${entry.minimized ? 'workspace-window-tab--minimized' : 'workspace-window-tab--active'}`} key={entry.id}>
          <button type="button" aria-current={!entry.minimized ? 'page' : undefined} data-window-tab={entry.id} onClick={() => restore(entry)} title={entry.title}>
            <Maximize2 size={14}/><span>{entry.title}</span><i>ذخیره‌نشده</i>
          </button>
          <button type="button" className="workspace-window-tab__close" aria-label={`بستن ${entry.title}`} onClick={() => setPendingDiscardId(entry.id)}><X size={14}/></button>
        </div>)}
      </div>
      {tabCloseBlocked && !pendingDiscard && <div className="workspace-window-navigation-warning" role="status">
        <AlertTriangle size={16}/><span>این تب یک فرم ذخیره‌نشده دارد. ابتدا فرم را ذخیره کنید یا از نوار پنجره‌های باز آن را ببندید.</span>
        <button type="button" onClick={() => setTabCloseBlocked(false)} aria-label="بستن پیام"><X size={14}/></button>
      </div>}
      {pendingDiscard && <div className="workspace-window-discard" role="alertdialog" aria-modal="true" aria-labelledby="workspace-window-discard-title">
        <AlertTriangle size={19}/><div><strong id="workspace-window-discard-title">تغییرات «{pendingDiscard.title}» حذف شود؟</strong><span>اطلاعاتی که هنوز ذخیره نکرده‌اید از بین می‌رود.</span></div>
        <button type="button" className="button button--secondary" onClick={() => {setPendingDiscardId(null);restore(pendingDiscard);}}>بازگشت به فرم</button>
        <button type="button" className="button button--danger" onClick={() => discard(pendingDiscard)}>بستن و حذف تغییرات</button>
      </div>}
    </section>}
  </>;
}
