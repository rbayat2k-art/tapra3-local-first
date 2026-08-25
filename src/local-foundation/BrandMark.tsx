import {PRODUCT_DESCRIPTION, PRODUCT_NAME, PRODUCT_NAME_LATIN, PRODUCT_TAGLINE} from './branding';

const shahrahMark = new URL('../assets/shahrah-mark.png', import.meta.url).href;

interface BrandMarkProps {
  variant?: 'mark' | 'lockup';
  showTagline?: boolean;
  decorative?: boolean;
  className?: string;
}

export function BrandMark({variant = 'lockup', showTagline = false, decorative = false, className = ''}: BrandMarkProps) {
  const accessible = decorative ? {'aria-hidden': true as const} : {'aria-label': PRODUCT_NAME};
  return <span className={`shahrah-brand shahrah-brand--${variant} ${className}`.trim()} {...accessible}>
    <span className="shahrah-brand__mark"><img src={shahrahMark} alt="" /></span>
    {variant === 'lockup' && <span className="shahrah-brand__copy">
      <strong>{PRODUCT_NAME}</strong>
      <small dir="ltr">{PRODUCT_NAME_LATIN}</small>
      {showTagline && <em>{PRODUCT_TAGLINE}</em>}
      {!showTagline && <em>{PRODUCT_DESCRIPTION}</em>}
    </span>}
  </span>;
}
