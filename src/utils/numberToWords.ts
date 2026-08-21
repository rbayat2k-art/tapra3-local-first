// Conversion of numbers to Persian words & currency formatting

const YEKAN = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه'];
const DAHGAN = ['', 'ده', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
const SADGAN = ['', 'یکصد', 'دوصد', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
const DAH_TA_BIST = ['ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
const HEZARAN = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون'];

function threeDigitsToWords(num: number): string {
  if (num === 0) return '';
  
  const sad = Math.floor(num / 100);
  const dahR = num % 100;
  const dah = Math.floor(dahR / 10);
  const yek = dahR % 10;
  
  const parts: string[] = [];
  
  if (sad > 0) parts.push(SADGAN[sad]);
  
  if (dahR >= 10 && dahR < 20) {
    parts.push(DAH_TA_BIST[dahR - 10]);
  } else {
    if (dah > 0) parts.push(DAHGAN[dah]);
    if (yek > 0) parts.push(YEKAN[yek]);
  }
  
  return parts.join(' و ');
}

export function numberToPersianWords(amount: number): string {
  if (!amount || isNaN(amount) || amount === 0) {
    return 'صفر ریال';
  }

  let num = Math.abs(Math.floor(amount));
  let hIndex = 0;
  const parts: string[] = [];

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const chunkWords = threeDigitsToWords(chunk);
      const unit = HEZARAN[hIndex];
      parts.unshift(unit ? `${chunkWords} ${unit}` : chunkWords);
    }
    num = Math.floor(num / 1000);
    hIndex++;
  }

  const words = parts.join(' و ');
  return `${words} ریال`;
}

export function formatRial(amount: number | string): string {
  const num = typeof amount === 'string' ? parseFloat(amount.replace(/,/g, '')) : amount;
  if (isNaN(num)) return '۰ ریال';
  return `${num.toLocaleString('fa-IR')} ریال`;
}

export function formatCardNumber(card: string): string {
  if (!card) return '-';
  const clean = card.replace(/\D/g, '');
  if (clean.length === 16) {
    return `${clean.slice(0, 4)}-${clean.slice(4, 8)}-${clean.slice(8, 12)}-${clean.slice(12, 16)}`;
  }
  return card;
}
