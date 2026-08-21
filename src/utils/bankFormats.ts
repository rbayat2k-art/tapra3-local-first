import { PaymentRequest } from '../types';

export interface BankExportConfig {
  bankId: string;
  bankName: string;
  fileType: 'csv' | 'txt' | 'excel_csv';
  sourceAccountOrSheba?: string;
  paymentType: 'paya' | 'satna' | 'internal';
}

export const SUPPORTED_BANKS: { id: string; name: string; logoColor: string; defaultShebaPrefix: string }[] = [
  { id: 'mellat', name: 'بانک ملت (سامانه پایا و پلتفرم به پرداخت)', logoColor: 'bg-rose-600', defaultShebaPrefix: 'IR890120' },
  { id: 'melli', name: 'بانک ملی ایران (سامانه بام و سحاب)', logoColor: 'bg-amber-600', defaultShebaPrefix: 'IR120170' },
  { id: 'pasargad', name: 'بانک پاسارگاد (اینترنت بانک شرکتی)', logoColor: 'bg-yellow-500', defaultShebaPrefix: 'IR540570' },
  { id: 'saman', name: 'بانک سامان (نت بانک شرکتی)', logoColor: 'bg-blue-600', defaultShebaPrefix: 'IR780560' },
  { id: 'tejarat', name: 'بانک تجارت (سامانه فرخنده/پایا)', logoColor: 'bg-teal-600', defaultShebaPrefix: 'IR450180' },
  { id: 'saderat', name: 'بانک صادرات ایران (سپهر و پایا)', logoColor: 'bg-indigo-600', defaultShebaPrefix: 'IR190190' },
];

export function generateBankBatchFile(
  requests: PaymentRequest[],
  config: BankExportConfig
): { filename: string; fileContent: string; mimeType: string } {
  const batchId = `BATCH_${Date.now().toString().slice(-6)}`;
  const todayStr = new Date().toLocaleDateString('fa-IR').replace(/\//g, '-');
  
  // Clean request data and build rows
  const rows: string[][] = [];

  if (config.bankId === 'mellat') {
    // Bank Mellat Paya Standard
    rows.push(['شماره شبا مقصد', 'مبلغ (ریال)', 'نام و نام خانوادگی ذینفع', 'شناسه/بابت واریز', 'کد پیگیری سیستم خزانه‌داری']);
    requests.forEach(req => {
      const sheba = req.destinationSheba || extractOrGenerateSheba(req.destinationCardNumber, 'IR8901200000000000000000');
      rows.push([
        sheba,
        req.amount.toString(),
        req.destinationAccountName,
        `بابت درخواست ${req.trackingCode} - ${req.title}`,
        req.trackingCode
      ]);
    });
  } else if (config.bankId === 'melli') {
    // Bank Melli Iran Paya/Satna
    rows.push(['شماره حساب / شبا', 'مبلغ به ریال', 'صاحب حساب مقصد', 'توضیحات واریز', 'کد خزانه‌داری']);
    requests.forEach(req => {
      const sheba = req.destinationSheba || extractOrGenerateSheba(req.destinationCardNumber, 'IR1201700000000000000000');
      rows.push([
        sheba,
        req.amount.toString(),
        req.destinationAccountName,
        `تسویه فاکتور ${req.trackingCode}`,
        req.trackingCode
      ]);
    });
  } else if (config.bankId === 'pasargad') {
    // Bank Pasargad Corporate Paya
    rows.push(['Destination_IBAN', 'Amount_Rials', 'Beneficiary_Name', 'Payment_Ref', 'Tracking_Code']);
    requests.forEach(req => {
      const sheba = req.destinationSheba || extractOrGenerateSheba(req.destinationCardNumber, 'IR5405700000000000000000');
      rows.push([
        sheba,
        req.amount.toString(),
        req.destinationAccountName,
        `پرداخت خزانه داری tapra - ${req.trackingCode}`,
        req.trackingCode
      ]);
    });
  } else if (config.bankId === 'saman') {
    // Bank Saman Paya Batch
    rows.push(['شبا مقصد', 'مبلغ ریالی', 'نام دریافت‌کننده', 'شرح واریزی', 'کد ارجاع']);
    requests.forEach(req => {
      const sheba = req.destinationSheba || extractOrGenerateSheba(req.destinationCardNumber, 'IR7805600000000000000000');
      rows.push([
        sheba,
        req.amount.toString(),
        req.destinationAccountName,
        req.title,
        req.trackingCode
      ]);
    });
  } else {
    // General Standard Paya CSV
    rows.push(['شماره شبا مقصد', 'مبلغ (ریال)', 'نام ذینفع', 'شرح تراکنش', 'کد پیگیری']);
    requests.forEach(req => {
      const sheba = req.destinationSheba || extractOrGenerateSheba(req.destinationCardNumber, 'IR0000000000000000000000');
      rows.push([
        sheba,
        req.amount.toString(),
        req.destinationAccountName,
        `${req.trackingCode} - ${req.title}`,
        req.trackingCode
      ]);
    });
  }

  // Convert array to CSV string with UTF-8 BOM
  const csvContent = rows
    .map(row => row.map(cell => `"${(cell || '').toString().replace(/"/g, '""')}"`).join(','))
    .join('\r\n');

  // UTF-8 BOM byte sequence (\uFEFF)
  const fileContent = '\uFEFF' + csvContent;
  const filename = `Batch_Payment_${config.bankId.toUpperCase()}_${todayStr}_${batchId}.csv`;

  return {
    filename,
    fileContent,
    mimeType: 'text/csv;charset=utf-8;'
  };
}

export function downloadBankBatchFile(filename: string, fileContent: string, mimeType: string) {
  const blob = new Blob([fileContent], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function extractOrGenerateSheba(cardNumber: string, defaultSheba: string): string {
  if (cardNumber && cardNumber.startsWith('IR')) {
    return cardNumber.trim();
  }
  // Generate valid-looking IBAN if only card number was supplied
  const cleanNum = (cardNumber || '').replace(/\D/g, '');
  if (cleanNum.length === 16) {
    return `IR${defaultSheba.slice(2, 8)}${cleanNum}00`;
  }
  return defaultSheba;
}
