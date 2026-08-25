import {CircleAlert, X} from 'lucide-react';
import {useEffect, useId, useRef, useState} from 'react';
import type {ReactNode} from 'react';

export interface RequiredFieldCheck {
  label: string;
  value: unknown;
  valid?: (value: unknown) => boolean;
  message?: string;
}

interface ValidationPopupDetail {
  sourceId: string;
  errors: string[];
  targets: Array<HTMLElement | null>;
  ownerElement: HTMLElement;
}

const SHOW_VALIDATION_POPUP = 'foundation:show-validation-popup';
const CLEAR_VALIDATION_POPUP = 'foundation:clear-validation-popup';
const FIELD_SELECTOR = [
  'input:not([type="hidden"]):not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[contenteditable="true"]',
  '[role="combobox"]',
].join(',');

function normalizeValidationText(value: string) {
  return value
    .normalize('NFKC')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200f\u202a-\u202e]/g, ' ')
    .replace(/[«»"'()،,:؛.\-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('fa-IR');
}

function isVisible(element: HTMLElement) {
  return element.isConnected && element.getClientRects().length > 0 && !element.closest('[hidden],[aria-hidden="true"]');
}

function fieldText(element: HTMLElement) {
  const chunks: string[] = [];
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) chunks.push(ariaLabel);
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) {
    labelledBy.split(/\s+/).forEach((id) => {
      const label = document.getElementById(id);
      if (label?.textContent) chunks.push(label.textContent);
    });
  }
  if (element.id) {
    const label = document.querySelector<HTMLLabelElement>(`label[for="${CSS.escape(element.id)}"]`);
    if (label?.textContent) chunks.push(label.textContent);
  }
  const wrappingLabel = element.closest('label');
  if (wrappingLabel?.textContent) chunks.push(wrappingLabel.textContent);
  const field = element.closest<HTMLElement>('.field,.field-label,.form-field,.input-group,.purchase-allocation-row');
  if (field?.textContent) chunks.push(field.textContent);
  return normalizeValidationText(chunks.join(' '));
}

function isEmptyRequiredField(element: HTMLElement) {
  if (!(element.matches('[required],[aria-required="true"]'))) return false;
  if (element instanceof HTMLInputElement) {
    if (element.type === 'checkbox' || element.type === 'radio') return !element.checked;
    if (element.type === 'file') return !element.files?.length;
    return !element.value.trim();
  }
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return !element.value.trim();
  return !element.textContent?.trim();
}

function validationScope(anchor: HTMLElement) {
  return anchor.closest<HTMLElement>('form,[role="dialog"],.modal-card,.record-drawer,.drawer,.dialog')
    ?? anchor.parentElement
    ?? document.body;
}

function findTargetForError(scope: HTMLElement, error: string, candidates: HTMLElement[], used: Set<HTMLElement>) {
  const normalizedError = normalizeValidationText(error);
  const ranked = candidates
    .filter((candidate) => !used.has(candidate))
    .map((candidate, index) => {
      const label = fieldText(candidate);
      const invalid = candidate.getAttribute('aria-invalid') === 'true';
      const emptyRequired = isEmptyRequiredField(candidate);
      const visible = isVisible(candidate);
      const words = label.split(' ').filter((word) => word.length > 1);
      const labelMatch = label && (normalizedError.includes(label) || words.filter((word) => normalizedError.includes(word)).length >= Math.min(2, words.length));
      const score = (invalid ? 100 : 0) + (labelMatch ? 50 : 0) + (emptyRequired ? 20 : 0) + (visible ? 5 : 0) - index / 10_000;
      return {candidate, score};
    })
    .filter(({score}) => score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.candidate ?? null;
}

function collectValidationTargets(anchor: HTMLElement, errors: string[]) {
  const scope = validationScope(anchor);
  const candidates = Array.from(scope.querySelectorAll<HTMLElement>(FIELD_SELECTOR));
  const used = new Set<HTMLElement>();
  const targets = errors.map((error) => {
    const target = findTargetForError(scope, error, candidates, used);
    if (target) used.add(target);
    return target;
  });
  scope.querySelectorAll<HTMLElement>('[data-validation-highlight="true"]').forEach((field) => delete field.dataset.validationHighlight);
  targets.forEach((target) => {
    if (!target) return;
    target.dataset.validationHighlight = 'true';
    if (target.getAttribute('aria-invalid') !== 'true') {
      target.setAttribute('aria-invalid', 'true');
      target.dataset.validationAutoInvalid = 'true';
    }
  });
  return {scope, targets};
}

function revealAndFocus(target: HTMLElement | null, fallback: HTMLElement) {
  const destination = target ?? fallback;
  let ancestor: HTMLElement | null = destination.parentElement;
  while (ancestor) {
    if (ancestor instanceof HTMLDetailsElement) ancestor.open = true;
    ancestor = ancestor.parentElement;
  }
  const hiddenPanel = destination.closest<HTMLElement>('[hidden][id]');
  if (hiddenPanel) {
    document.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(hiddenPanel.id)}"]`)?.click();
  }
  window.setTimeout(() => {
    destination.scrollIntoView({behavior: 'smooth', block: 'center', inline: 'nearest'});
    if (destination.matches('input,select,textarea,button,[tabindex],[contenteditable="true"]')) {
      destination.focus({preventScroll: true});
    } else {
      destination.setAttribute('tabindex', '-1');
      destination.focus({preventScroll: true});
    }
  }, 40);
}

export function validateRequired(fields: RequiredFieldCheck[]): string[] {
  return fields.flatMap((field) => {
    const filled = field.valid
      ? field.valid(field.value)
      : Array.isArray(field.value)
        ? field.value.length > 0
        : typeof field.value === 'string'
          ? field.value.trim().length > 0
          : field.value !== undefined && field.value !== null && field.value !== false;
    return filled ? [] : [field.message ?? `فیلد «${field.label}» الزامی است؛ لطفاً آن را تکمیل کنید.`];
  });
}

export function RequiredLabel({children}: {children: ReactNode}) {
  return <span className="field-label-status required-label"><span>{children}<i aria-hidden="true">*</i></span><em>الزامی</em></span>;
}

export function OptionalLabel({children}: {children: ReactNode}) {
  return <span className="field-label-status optional-label"><span>{children}</span><em>اختیاری</em></span>;
}

export function SystemLabel({children}: {children: ReactNode}) {
  return <span className="field-label-status system-label"><span>{children}</span><em>تولید خودکار</em></span>;
}

export function FormValidationSummary({errors}: {errors: string[]}) {
  const sourceId = useId();
  const anchorRef = useRef<HTMLSpanElement>(null);
  const errorSignature = errors.join('\u0000');

  useEffect(() => {
    const anchor = anchorRef.current;
    if (!anchor) return;
    const activeErrors = errorSignature ? errorSignature.split('\u0000') : [];
    if (!activeErrors.length) {
      window.dispatchEvent(new CustomEvent(CLEAR_VALIDATION_POPUP, {detail: {sourceId}}));
      return;
    }
    const {scope, targets} = collectValidationTargets(anchor, activeErrors);
    const detail: ValidationPopupDetail = {sourceId, errors: activeErrors, targets, ownerElement: scope};
    window.dispatchEvent(new CustomEvent<ValidationPopupDetail>(SHOW_VALIDATION_POPUP, {detail}));
    revealAndFocus(targets[0], scope);
    return () => {
      targets.forEach((target) => {
        if (!target) return;
        delete target.dataset.validationHighlight;
        if (target.dataset.validationAutoInvalid === 'true') {
          target.removeAttribute('aria-invalid');
          delete target.dataset.validationAutoInvalid;
        }
      });
    };
  }, [errorSignature, sourceId]);

  useEffect(() => () => {
    window.dispatchEvent(new CustomEvent(CLEAR_VALIDATION_POPUP, {detail: {sourceId}}));
  }, [sourceId]);

  return <span ref={anchorRef} className="form-validation-summary-anchor" aria-hidden="true" />;
}

export function FormValidationPopupHost() {
  const [active, setActive] = useState<ValidationPopupDetail | null>(null);

  useEffect(() => {
    const show = (event: Event) => setActive((event as CustomEvent<ValidationPopupDetail>).detail);
    const clear = (event: Event) => {
      const sourceId = (event as CustomEvent<{sourceId: string}>).detail?.sourceId;
      setActive((current) => current?.sourceId === sourceId ? null : current);
    };
    const activeTabChanged = () => setActive((current) => current && isVisible(current.ownerElement) ? current : null);
    window.addEventListener(SHOW_VALIDATION_POPUP, show);
    window.addEventListener(CLEAR_VALIDATION_POPUP, clear);
    window.addEventListener('workspace:active-tab-changed', activeTabChanged);
    return () => {
      window.removeEventListener(SHOW_VALIDATION_POPUP, show);
      window.removeEventListener(CLEAR_VALIDATION_POPUP, clear);
      window.removeEventListener('workspace:active-tab-changed', activeTabChanged);
    };
  }, []);

  if (!active || !active.errors.length || !active.ownerElement.isConnected) return null;
  return <aside className="form-validation-popup" role="alert" aria-live="assertive" aria-label="نواقص فرم">
    <div className="form-validation-popup__title">
      <CircleAlert size={19} aria-hidden="true" />
      <strong>فرم کامل نیست</strong>
      <span>{active.errors.length.toLocaleString('fa-IR')} مورد</span>
    </div>
    <div className="form-validation-popup__items" aria-label="فهرست نواقص">
      {active.errors.map((error, index) => <button type="button" key={`${index}-${error}`} onClick={() => revealAndFocus(active.targets[index], active.ownerElement)}>
        <span>{(index + 1).toLocaleString('fa-IR')}</span>{error}
      </button>)}
    </div>
    <button type="button" className="form-validation-popup__close" aria-label="بستن نوار نواقص" onClick={() => setActive(null)}><X size={18} /></button>
  </aside>;
}
