import {useMemo, useRef, useState, type KeyboardEvent} from 'react';
import {ArrowLeft, ChevronLeft, Search, X, type LucideIcon} from 'lucide-react';
import {searchNavigationDestinations, type NavigationDestinationBase} from './navigationDiscovery';

export interface NavigationSearchDestination extends NavigationDestinationBase {
  icon: LucideIcon;
}

interface Props {
  destinations: NavigationSearchDestination[];
  onSelect: (destination: NavigationSearchDestination) => void;
  onQueryStateChange?: (active: boolean) => void;
}

export function NavigationSearch({destinations, onSelect, onQueryStateChange}: Props) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const resultRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const results = useMemo(() => searchNavigationDestinations(destinations, query), [destinations, query]);
  const active = Boolean(query.trim());

  function updateQuery(value: string) {
    setQuery(value);
    onQueryStateChange?.(Boolean(value.trim()));
  }

  function choose(destination: NavigationSearchDestination) {
    updateQuery('');
    onSelect(destination);
  }

  function moveFromInput(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      resultRefs.current[0]?.focus();
    } else if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      resultRefs.current[results.length - 1]?.focus();
    } else if (event.key === 'Enter' && results[0]) {
      event.preventDefault();
      choose(results[0]);
    } else if (event.key === 'Escape' && active) {
      event.preventDefault();
      updateQuery('');
    }
  }

  function moveBetweenResults(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      resultRefs.current[(index + 1) % results.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (index === 0) inputRef.current?.focus();
      else resultRefs.current[index - 1]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      updateQuery('');
      inputRef.current?.focus();
    }
  }

  return (
    <section className={`navigation-search ${active ? 'navigation-search--active' : ''}`} aria-label="جست‌وجوی منوی اصلی">
      <div className="navigation-search__field">
        <Search size={18} aria-hidden="true" />
        <input
          ref={inputRef}
          id="sidebar-navigation-search"
          type="search"
          value={query}
          onChange={(event) => updateQuery(event.target.value)}
          onKeyDown={moveFromInput}
          placeholder="جست‌وجوی منو و کارها…"
          aria-label="جست‌وجوی منو و کارها"
          autoComplete="off"
        />
        {active && <button type="button" onClick={() => {updateQuery('');inputRef.current?.focus();}} aria-label="پاک‌کردن جست‌وجو"><X size={16}/></button>}
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {active ? `${results.length.toLocaleString('fa-IR')} نتیجه در منوهای مجاز شما` : ''}
      </span>
      {active && <div className="navigation-search__results" aria-label="نتیجه‌های جست‌وجوی منو">
        {results.map((destination, index) => {
          const Icon = destination.icon;
          const path = destination.path?.length ? destination.path : [destination.group, destination.title];
          return <button
            key={destination.id}
            ref={(element) => {resultRefs.current[index] = element;}}
            type="button"
            className="navigation-search__result"
            onClick={() => choose(destination)}
            onKeyDown={(event) => moveBetweenResults(event, index)}
          >
            <span><Icon size={18}/></span>
            <div>
              <strong>{destination.title}</strong>
              <small>{destination.subtitle}</small>
              <span className="navigation-search__path" role="group" aria-label={`مسیر دسترسی: ${path.join('، سپس ')}`}>
                {path.map((segment, pathIndex) => <span key={`${segment}-${pathIndex}`}>
                  {pathIndex > 0 && <ChevronLeft size={11} aria-hidden="true"/>}
                  <i>{segment}</i>
                </span>)}
              </span>
            </div>
            <ArrowLeft size={16}/>
          </button>;
        })}
        {!results.length && <div className="navigation-search__empty"><Search size={21}/><strong>در منوهای مجاز شما موردی پیدا نشد.</strong><span>عبارت دیگری وارد کنید.</span></div>}
      </div>}
    </section>
  );
}
