import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowRightLeft, Boxes, ClipboardCheck, ClipboardList, PackageCheck, RefreshCw, RotateCcw, Undo2, Warehouse } from 'lucide-react';
import { FoundationApiError, foundationApi } from '../api/client';
import type { FoundationSalesInvoice, InventoryReturnDisposition, InventoryTrackingMode, WarehouseLocationType, WarehouseOverview } from '../api/contracts';
import { useFoundationSession } from '../auth/FoundationSessionContext';
import { buildReservationCandidates, visibleWarehouseSections, type ReservationCandidate, type WarehouseSection as Section } from './operationalModel';

const sections: Array<{ id: Section; label: string; icon: typeof Warehouse }> = [
  { id: 'warehouses', label: 'انبارها', icon: Warehouse },
  { id: 'inventory', label: 'موجودی', icon: Boxes },
  { id: 'receipts', label: 'دریافت کالا', icon: PackageCheck },
  { id: 'reservations', label: 'رزروها', icon: ClipboardCheck },
  { id: 'transfers', label: 'انتقال بین انبارها', icon: ArrowRightLeft },
  { id: 'adjustments', label: 'اصلاح موجودی', icon: RotateCcw },
  { id: 'counts', label: 'شمارش موجودی', icon: ClipboardList },
  { id: 'returns', label: 'برگشتی‌ها', icon: Undo2 },
];

const quantityPattern = /^(0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/;
const inputClass = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100';
const buttonClass = 'rounded-lg bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryButtonClass = 'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-50';

const statusLabels: Record<string, string> = {
  DRAFT: 'پیش‌نویس', OPEN: 'باز', SUBMITTED: 'ارسال‌شده', POSTED: 'ثبت قطعی', CANCELLED: 'لغوشده',
  PARTIALLY_RESERVED: 'رزرو جزئی', RESERVED: 'رزروشده', RELEASED: 'آزادشده', ACTIVE: 'فعال',
  IN_TRANSIT: 'در مسیر', RECEIVED: 'دریافت‌شده', INSPECTED: 'بازرسی‌شده',
  PURCHASE: 'دریافت خرید', MANUAL: 'دریافت دستی',
  NONE: 'بدون رهگیری', LOT: 'بچ/سری ساخت', SERIAL: 'سریال',
  RECEIVING: 'دریافت', PICKING: 'برداشت', PACKING: 'بسته‌بندی',
  RETURNS: 'ورودی برگشتی', TRANSIT: 'در حال انتقال',
  RECEIPT: 'ورود کالا', INTERNAL_MOVE: 'جابجایی داخلی', TRANSFER_OUT: 'خروج انتقالی',
  TRANSFER_IN: 'ورود انتقالی', DISPATCH: 'خروج قطعی', RETURN_RECEIPT: 'دریافت برگشتی',
  ADJUSTMENT_IN: 'افزایش اصلاحی', ADJUSTMENT_OUT: 'کاهش اصلاحی',
  COUNT_RECONCILIATION_IN: 'افزایش ناشی از شمارش', COUNT_RECONCILIATION_OUT: 'کاهش ناشی از شمارش',
  REVERSAL: 'ثبت معکوس',
  SELLABLE: 'قابل فروش', QUARANTINE: 'قرنطینه', DAMAGED: 'آسیب‌دیده',
  RETURN_TO_SUPPLIER: 'بازگشت به تأمین‌کننده', SCRAP: 'اسقاط',
};

const errorLabels: Record<string, string> = {
  permission_denied: 'برای این عملیات دسترسی لازم را ندارید.',
  warehouse_scope_unsupported: 'این بخش فعلاً فقط در محدوده فضای کاری یا شرکت قابل استفاده است.',
  warehouse_cross_company_forbidden: 'این عملیات خارج از شرکت مجاز شماست.',
  inventory_item_unresolved: 'این قلم هنوز به کالای پایدار انبار متصل نشده است.',
  invoice_line_not_financially_eligible: 'این ردیف فاکتور هنوز از نظر مالی آماده رزرو نیست.',
  old_invoice_revision_denied: 'نسخه قدیمی فاکتور قابل رزرو نیست.',
  negative_inventory_denied: 'این عملیات موجودی را منفی یا موجودی رزروشده را مصرف می‌کند.',
  serial_already_on_hand: 'این شماره سریال هم‌اکنون در موجودی ثبت شده است.',
  serial_quantity_invalid: 'تعداد کالای سریالی باید دقیقاً یک باشد.',
  warehouse_maker_checker_denied: 'ثبت‌کننده نمی‌تواند عملیات کنترلی خودش را تأیید کند.',
  warehouse_approval_impersonation_forbidden: 'تأیید کنترلی در حالت ورود به نمای کاربر مجاز نیست.',
};

function messageFrom(error: unknown): string {
  if (error instanceof FoundationApiError) return errorLabels[error.code] ?? 'عملیات انجام نشد؛ اطلاعات و وضعیت فعلی را بررسی کنید.';
  return 'ارتباط با سامانه انجام نشد. دوباره تلاش کنید.';
}

function localDate(value: string | null): string { return value ? new Date(value).toLocaleString('fa-IR') : '—'; }

export function warehouseStatusLabel(value: string, fallback = 'وضعیت ثبت‌شده'): string {
  return statusLabels[value] ?? fallback;
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><h3 className="mb-4 text-base font-black text-slate-800">{title}</h3>{children}</section>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-bold text-slate-600"><span className="mb-1 block">{label}</span>{children}</label>;
}

function Empty({ text }: { text: string }) { return <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500">{text}</p>; }

function ReasonAction({ label, busy, onConfirm }: { label: string; busy: boolean; onConfirm: (reason: string) => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  if (!open) return <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => setOpen(true)}>{label}</button>;
  return <div className="flex min-w-64 flex-wrap items-end gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2">
    <Field label="دلیل اقدام"><input autoFocus className={inputClass} value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} /></Field>
    <button type="button" className={buttonClass} disabled={busy || reason.trim().length < 3} onClick={() => { onConfirm(reason.trim()); setReason(''); setOpen(false); }}>تأیید</button>
    <button type="button" className={secondaryButtonClass} disabled={busy} onClick={() => { setReason(''); setOpen(false); }}>انصراف</button>
  </div>;
}

export function WarehouseFoundationView() {
  const { session } = useFoundationSession();
  const permissions = session?.activeContext?.permissions ?? [];
  const canRead = permissions.includes('warehouse.read');
  const [section, setSection] = useState<Section>('warehouses');
  const [data, setData] = useState<WarehouseOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [invoices, setInvoices] = useState<FoundationSalesInvoice[]>([]);
  const canReadInvoices = permissions.includes('sales.invoice.read_own') || permissions.includes('sales.invoice.read_all');
  const allowedSections = useMemo(() => visibleWarehouseSections(permissions), [permissions]);

  const companies = useMemo(() => {
    const map = new Map<string, string>();
    for (const membership of session?.memberships ?? []) if (membership.company) map.set(membership.company.id, membership.company.name);
    return [...map].map(([id, name]) => ({ id, name }));
  }, [session?.memberships]);
  const workspaceMode = session?.activeContext?.scope.type === 'WORKSPACE';
  const [ownerCompanyId, setOwnerCompanyId] = useState('');
  useEffect(() => {
    const forced = session?.activeContext?.company?.id;
    setOwnerCompanyId(forced ?? (companies.length === 1 ? companies[0]!.id : ''));
  }, [companies, session?.activeContext?.company?.id]);
  const owner = () => workspaceMode ? { ownerCompanyId } : {};

  const load = useCallback(async () => {
    if (!canRead) { setLoading(false); return; }
    setLoading(true);
    try { setData((await foundationApi.readWarehouse()).warehouse); setError(null); }
    catch (caught) { setError(messageFrom(caught)); }
    finally { setLoading(false); }
  }, [canRead, session?.activeContext?.contextKey]);
  useEffect(() => { void load(); }, [load]);
  const loadInvoices = useCallback(async () => {
    if (!permissions.includes('warehouse.reservation.manage') || !canReadInvoices) {
      setInvoices([]);
      return;
    }
    try { setInvoices((await foundationApi.listSalesInvoices()).invoices); }
    catch { setInvoices([]); }
  }, [canReadInvoices, permissions, session?.activeContext?.contextKey]);
  useEffect(() => {
    void loadInvoices();
  }, [loadInvoices]);
  useEffect(() => {
    if (!allowedSections.includes(section)) setSection(allowedSections[0] ?? 'inventory');
  }, [allowedSections, section]);

  const perform = async (action: () => Promise<unknown>, message: string) => {
    if (!session) return;
    setSaving(true); setError(null); setSuccess(null);
    try { await action(); setSuccess(message); await Promise.all([load(), loadInvoices()]); }
    catch (caught) { setError(messageFrom(caught)); }
    finally { setSaving(false); }
  };

  const warehouseName = (id: string) => data?.warehouses.find((item) => item.id === id)?.name ?? 'انبار در دسترس نیست';
  const locationName = (id: string) => data?.locations.find((item) => item.id === id)?.name ?? 'محل در دسترس نیست';
  const itemName = (id: string) => data?.items.find((item) => item.id === id)?.name ?? 'کالا در دسترس نیست';
  const positive = (value: string) => quantityPattern.test(value) && !/^0(?:\.0+)?$/.test(value);

  if (!canRead) return <Empty text="برای مشاهده عملیات انبار دسترسی ندارید." />;
  if (loading && !data) return <Empty text="در حال دریافت اطلاعات انبار…" />;
  if (!data) return <Empty text={error ?? 'اطلاعات انبار در دسترس نیست.'} />;

  return (
    <div className="space-y-4 p-4 text-right" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-l from-slate-900 to-indigo-900 p-5 text-white shadow-lg">
        <div><h2 className="text-xl font-black">عملیات انبار</h2><p className="mt-1 text-sm text-indigo-100">موجودی قطعی، رزرو، کنترل و برگشتی بر پایه سوابق غیرقابل‌حذف</p></div>
        <button className="flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25" onClick={() => void load()} disabled={loading}><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />به‌روزرسانی</button>
      </div>

      {workspaceMode && companies.length > 1 && <Card title="شرکت عملیاتی">
        <Field label="شرکت مالک موجودی"><select className={inputClass} value={ownerCompanyId} onChange={(event) => setOwnerCompanyId(event.target.value)}><option value="">انتخاب شرکت</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></Field>
      </Card>}
      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-bold text-rose-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm font-bold text-emerald-700">{success}</div>}

      <div className="flex gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
        {sections.filter(({ id }) => allowedSections.includes(id)).map(({ id, label, icon: Icon }) => <button key={id} onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold ${section === id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Icon className="h-4 w-4" />{label}</button>)}
      </div>

      {section === 'warehouses' && <WarehousesSection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} />}
      {section === 'inventory' && <InventorySection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} warehouseName={warehouseName} locationName={locationName} />}
      {section === 'receipts' && <ReceiptsSection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} warehouseName={warehouseName} itemName={itemName} positive={positive} />}
      {section === 'reservations' && <ReservationsSection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} candidates={buildReservationCandidates(invoices, data.reservations.filter((reservation) => reservation.status !== 'RELEASED').map((reservation) => reservation.invoiceLineId))} canReadInvoices={canReadInvoices} />}
      {section === 'transfers' && <TransfersSection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} warehouseName={warehouseName} locationName={locationName} positive={positive} />}
      {section === 'adjustments' && <AdjustmentsSection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} itemName={itemName} locationName={locationName} positive={positive} />}
      {section === 'counts' && <CountsSection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} itemName={itemName} locationName={locationName} positive={positive} />}
      {section === 'returns' && <ReturnsSection data={data} csrf={session!.csrfToken} owner={owner()} permissions={permissions} saving={saving} perform={perform} warehouseName={warehouseName} itemName={itemName} positive={positive} invoices={invoices} />}
    </div>
  );
}

interface SectionProps { data: WarehouseOverview; csrf: string; owner: { ownerCompanyId?: string }; permissions: string[]; saving: boolean; perform: (action: () => Promise<unknown>, message: string) => Promise<void> }

function WarehousesSection({ data, csrf, owner, permissions, saving, perform }: SectionProps) {
  const [code, setCode] = useState(''); const [name, setName] = useState('');
  const [warehouseId, setWarehouseId] = useState(''); const [locationCode, setLocationCode] = useState(''); const [locationName, setLocationName] = useState('');
  const [locationType, setLocationType] = useState<WarehouseLocationType>('SELLABLE');
  const canManage = permissions.includes('warehouse.manage');
  return <div className="grid gap-4 xl:grid-cols-2">
    {canManage && <Card title="ایجاد انبار"><div className="grid gap-3 md:grid-cols-2"><Field label="کد"><input className={inputClass} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} /></Field><Field label="نام"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field></div><button className={`${buttonClass} mt-3`} disabled={saving || !code || name.trim().length < 2 || (!!owner.ownerCompanyId === false && Object.keys(owner).length > 0)} onClick={() => void perform(() => foundationApi.createWarehouse({ ...owner, code, name }, csrf), 'انبار ایجاد شد.')}>ایجاد انبار</button></Card>}
    {canManage && <Card title="ایجاد محل انبار"><div className="grid gap-3 md:grid-cols-2"><Field label="انبار"><select className={inputClass} value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}><option value="">انتخاب انبار</option>{data.warehouses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field><Field label="نوع محل"><select className={inputClass} value={locationType} onChange={(e) => setLocationType(e.target.value as WarehouseLocationType)}>{(['RECEIVING','SELLABLE','PICKING','PACKING','RETURNS','QUARANTINE','DAMAGED','TRANSIT'] as WarehouseLocationType[]).map((type) => <option key={type} value={type}>{warehouseStatusLabel(type)}</option>)}</select></Field><Field label="کد محل"><input className={inputClass} value={locationCode} onChange={(e) => setLocationCode(e.target.value.toUpperCase())} /></Field><Field label="نام محل"><input className={inputClass} value={locationName} onChange={(e) => setLocationName(e.target.value)} /></Field></div><button className={`${buttonClass} mt-3`} disabled={saving || !warehouseId || !locationCode || !locationName} onClick={() => void perform(() => foundationApi.createWarehouseLocation(warehouseId, { code: locationCode, name: locationName, locationType }, csrf), 'محل انبار ایجاد شد.')}>ایجاد محل</button></Card>}
    <Card title="فهرست انبارها"><div className="space-y-2">{data.warehouses.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 p-3"><div className="font-black text-slate-800">{item.name}</div><div className="text-xs text-slate-500">{item.code} · {data.locations.filter((location) => location.warehouseId === item.id).length} محل</div></div>)}{!data.warehouses.length && <Empty text="هنوز انباری ثبت نشده است." />}</div></Card>
    <Card title="محل‌ها"><div className="grid gap-2 md:grid-cols-2">{data.locations.map((item) => <div key={item.id} className="rounded-lg bg-slate-50 p-3 text-sm"><b>{item.name}</b><div className="text-xs text-slate-500">{item.code} · {warehouseStatusLabel(item.locationType)}</div></div>)}</div></Card>
  </div>;
}

function InventorySection({ data, csrf, permissions, saving, perform, warehouseName, locationName }: SectionProps & { warehouseName: (id: string) => string; locationName: (id: string) => string }) {
  const [sku, setSku] = useState(''); const [name, setName] = useState(''); const [reference, setReference] = useState(''); const [tracking, setTracking] = useState<InventoryTrackingMode>('NONE'); const [uom, setUom] = useState('PCS');
  return <div className="space-y-4">{permissions.includes('warehouse.item.manage') && <Card title="تعریف کالای پایدار انبار"><div className="grid gap-3 md:grid-cols-5"><Field label="کد کالا"><input className={inputClass} value={sku} onChange={(e) => setSku(e.target.value)} /></Field><Field label="نام"><input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} /></Field><Field label="مرجع کاتالوگ"><input className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} /></Field><Field label="رهگیری"><select className={inputClass} value={tracking} onChange={(e) => setTracking(e.target.value as InventoryTrackingMode)}>{(['NONE','LOT','SERIAL'] as InventoryTrackingMode[]).map((item) => <option key={item} value={item}>{statusLabels[item]}</option>)}</select></Field><Field label="واحد"><input className={inputClass} value={uom} onChange={(e) => setUom(e.target.value.toUpperCase())} /></Field></div><button className={`${buttonClass} mt-3`} disabled={saving || !sku || !name || !reference || !uom} onClick={() => void perform(() => foundationApi.createInventoryItem({ sku, name, catalogReference: reference, trackingMode: tracking, uom }, csrf), 'کالای انبار ایجاد شد.')}>ثبت کالا</button></Card>}
    <Card title="موجودی قطعی"><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-slate-500"><th className="p-2">کالا</th><th>انبار</th><th>محل</th><th>مقدار</th><th>واحد</th></tr></thead><tbody>{data.balances.map((balance) => <tr key={`${balance.locationId}:${balance.stockIdentityId}`} className="border-b"><td className="p-2 font-bold">{balance.name}</td><td>{warehouseName(balance.warehouseId)}</td><td>{locationName(balance.locationId)}</td><td dir="ltr">{balance.onHandQuantity}</td><td>{balance.uom}</td></tr>)}</tbody></table>{!data.balances.length && <Empty text="موجودی ثبت‌شده‌ای وجود ندارد." />}</div></Card>
    <Card title="آخرین سوابق موجودی"><div className="space-y-2">{data.movements.slice(0, 30).map((movement) => <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm"><div><b>{warehouseStatusLabel(movement.movementType, 'رویداد موجودی')}</b><div className="text-xs text-slate-500">{localDate(movement.occurredAt)} · مقدار {movement.quantity}</div></div>{permissions.includes('warehouse.movement.reverse') && !movement.reversesMovementId && movement.sourceType !== 'WAREHOUSE_TRANSFER' && <ReasonAction label="ثبت معکوس" busy={saving} onConfirm={(reason) => void perform(() => foundationApi.reverseInventoryMovement(movement.id, reason, csrf), 'سابقه با ثبت معکوس برگشت داده شد.')} />}</div>)}</div></Card></div>;
}

function ReceiptsSection({ data, csrf, owner, permissions, saving, perform, warehouseName, itemName, positive }: SectionProps & { warehouseName: (id: string) => string; itemName: (id: string) => string; positive: (v: string) => boolean }) {
  const [warehouseId, setWarehouseId] = useState(''); const [locationId, setLocationId] = useState(''); const [itemId, setItemId] = useState(''); const [quantity, setQuantity] = useState('1'); const [type, setType] = useState<'PURCHASE'|'MANUAL'>('PURCHASE'); const [source, setSource] = useState(''); const [reason, setReason] = useState(''); const [evidence, setEvidence] = useState(''); const [lotCode, setLotCode] = useState(''); const [serialCode, setSerialCode] = useState('');
  const item = data.items.find((candidate) => candidate.id === itemId);
  const locations = data.locations.filter((location) => location.warehouseId === warehouseId
    && ['RECEIVING', 'SELLABLE'].includes(location.locationType));
  const canCreate = permissions.includes('warehouse.receiving.create');
  const canPost = permissions.includes('warehouse.receiving.post');
  const canManual = permissions.includes('warehouse.receiving.manual');
  return <div className="space-y-4">{canCreate && <Card title="ثبت دریافت کالا"><div className="grid gap-3 md:grid-cols-3"><Field label="انبار"><select className={inputClass} value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setLocationId(''); }}><option value="">انتخاب انبار</option>{data.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></Field><Field label="محل دریافت"><select className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">انتخاب محل</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></Field><Field label="نوع دریافت"><select className={inputClass} value={type} onChange={(e) => setType(e.target.value as 'PURCHASE'|'MANUAL')}><option value="PURCHASE">خرید</option>{canManual && <option value="MANUAL">دستی</option>}</select></Field><Field label="کالا"><select className={inputClass} value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">انتخاب کالا</option>{data.items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field><Field label="مقدار"><input className={inputClass} dir="ltr" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>{item?.trackingMode === 'LOT' && <Field label="کد بچ/سری ساخت"><input className={inputClass} value={lotCode} onChange={(e) => setLotCode(e.target.value)} /></Field>}{item?.trackingMode === 'SERIAL' && <Field label="شماره سریال"><input className={inputClass} value={serialCode} onChange={(e) => setSerialCode(e.target.value)} /></Field>}<Field label="مرجع/منبع"><input className={inputClass} value={source} onChange={(e) => setSource(e.target.value)} /></Field><Field label="مدرک یا توضیح شاهد"><input className={inputClass} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></Field>{type === 'MANUAL' && <Field label="دلیل دریافت دستی"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}</div><button className={`${buttonClass} mt-3`} disabled={saving || !warehouseId || !locationId || !itemId || !positive(quantity) || source.length < 3 || evidence.length < 3 || (type === 'MANUAL' && reason.length < 3)} onClick={() => void perform(() => foundationApi.createWarehouseReceipt({ ...owner, warehouseId, receivingLocationId: locationId, receiptType: type, sourceNote: source, reason: type === 'MANUAL' ? reason : undefined, lines: [{ inventoryItemId: itemId, quantity, lotCode: lotCode || undefined, serialCode: serialCode || undefined, evidenceNote: evidence }] }, csrf), 'دریافت در حالت پیش‌نویس ثبت شد.')}>ثبت دریافت</button></Card>}
    <Card title="سوابق دریافت"><div className="space-y-2">{data.receipts.map((receipt) => <div key={receipt.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3"><div><b>{warehouseName(receipt.warehouseId)}</b><div className="text-xs text-slate-500">{statusLabels[receipt.receiptType]} · {statusLabels[receipt.status]} · {localDate(receipt.createdAt)}</div></div>{canPost && receipt.status === 'DRAFT' && <button className={buttonClass} disabled={saving} onClick={() => void perform(() => foundationApi.postWarehouseReceipt(receipt.id, csrf), 'دریافت در دفتر موجودی ثبت قطعی شد.')}>ثبت قطعی</button>}</div>)}</div></Card></div>;
}

function ReservationsSection({ data, csrf, owner, saving, perform, candidates, canReadInvoices }: SectionProps & { candidates: ReservationCandidate[]; canReadInvoices: boolean }) {
  const [lineId, setLineId] = useState('');
  return <div className="space-y-4"><Card title="رزرو ردیف فاکتور">
    {canReadInvoices ? <>
      <Field label="فاکتور و قلم آماده رزرو"><select className={inputClass} value={lineId} onChange={(event) => setLineId(event.target.value)}><option value="">انتخاب فاکتور و کالا</option>{candidates.map((candidate) => <option key={candidate.invoiceLineId} value={candidate.invoiceLineId}>{candidate.invoiceCode} · {candidate.customerName} · {candidate.itemName} · تعداد {candidate.quantity}</option>)}</select></Field>
      {!candidates.length && <Empty text="اکنون ردیف کالایی پرداخت‌شده و آماده رزرو وجود ندارد." />}
      <button className={`${buttonClass} mt-3`} disabled={saving || !lineId} onClick={() => void perform(() => foundationApi.createInventoryReservation({ ...owner, invoiceLineId: lineId }, csrf), 'رزرو بر اساس موجودی قابل استفاده انجام شد.')}>رزرو موجودی</button>
    </> : <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm leading-7 text-amber-900">برای انتخاب فاکتور به‌صورت کسب‌وکاری، این نقش علاوه بر مدیریت رزرو باید دسترسی مشاهده فاکتورهای شرکت را داشته باشد. ورودی شناسه فنی عمداً نمایش داده نمی‌شود.</div>}
    <p className="mt-2 text-xs text-slate-500">فقط آخرین نسخه ردیف کالایی که پرداخت آن کامل و تأیید شده باشد پذیرفته می‌شود.</p>
  </Card><Card title="رزروهای موجود"><div className="space-y-2">{data.reservations.map((reservation) => <div key={reservation.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><b>{statusLabels[reservation.status]}</b><div className="text-xs text-slate-500">درخواست {reservation.requestedQuantity} · رزرو {reservation.reservedQuantity} · کمبود {reservation.shortageQuantity}</div></div>{reservation.status !== 'RELEASED' && <ReasonAction label="آزادسازی" busy={saving} onConfirm={(reason) => void perform(() => foundationApi.releaseInventoryReservation(reservation.id, reason, csrf), 'رزرو آزاد شد؛ موجودی فیزیکی تغییر نکرد.')} />}</div>)}</div></Card></div>;
}

function TransfersSection({ data, csrf, owner, saving, perform, warehouseName, locationName, positive }: SectionProps & { warehouseName: (id: string) => string; locationName: (id: string) => string; positive: (v: string) => boolean }) {
  const [balanceKey, setBalanceKey] = useState(''); const [destinationWarehouse, setDestinationWarehouse] = useState(''); const [destinationLocation, setDestinationLocation] = useState(''); const [quantity, setQuantity] = useState('1'); const [reason, setReason] = useState('');
  const balance = data.balances.find((entry) => `${entry.locationId}:${entry.stockIdentityId}` === balanceKey);
  const destinations = data.locations.filter((entry) => entry.warehouseId === destinationWarehouse && entry.locationType === 'SELLABLE');
  return <div className="space-y-4"><Card title="ایجاد انتقال"><div className="grid gap-3 md:grid-cols-3"><Field label="موجودی مبدأ"><select className={inputClass} value={balanceKey} onChange={(e) => setBalanceKey(e.target.value)}><option value="">انتخاب موجودی</option>{data.balances.filter((entry) => entry.onHandQuantity !== '0.000000').map((entry) => <option key={`${entry.locationId}:${entry.stockIdentityId}`} value={`${entry.locationId}:${entry.stockIdentityId}`}>{entry.name} · {warehouseName(entry.warehouseId)} · {entry.onHandQuantity}</option>)}</select></Field><Field label="انبار مقصد"><select className={inputClass} value={destinationWarehouse} onChange={(e) => { setDestinationWarehouse(e.target.value); setDestinationLocation(''); }}><option value="">انتخاب مقصد</option>{data.warehouses.filter((entry) => entry.id !== balance?.warehouseId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field><Field label="محل مقصد"><select className={inputClass} value={destinationLocation} onChange={(e) => setDestinationLocation(e.target.value)}><option value="">انتخاب محل</option>{destinations.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field><Field label="مقدار"><input className={inputClass} dir="ltr" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field><Field label="دلیل"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div><button className={`${buttonClass} mt-3`} disabled={saving || !balance || !destinationWarehouse || !destinationLocation || !positive(quantity) || reason.length < 3} onClick={() => balance && void perform(() => foundationApi.createWarehouseTransfer({ ...owner, sourceWarehouseId: balance.warehouseId, destinationWarehouseId: destinationWarehouse, sourceLocationId: balance.locationId, destinationLocationId: destinationLocation, reason, lines: [{ stockIdentityId: balance.stockIdentityId, quantity }] }, csrf), 'انتقال در حالت پیش‌نویس ایجاد شد.')}>ایجاد انتقال</button></Card><Card title="انتقال‌ها"><div className="space-y-2">{data.transfers.map((transfer) => <div key={transfer.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><b>{warehouseName(transfer.sourceWarehouseId)} ← {warehouseName(transfer.destinationWarehouseId)}</b><div className="text-xs text-slate-500">{statusLabels[transfer.status]} · {locationName(transfer.sourceLocationId)} ← {locationName(transfer.destinationLocationId)}</div></div><div className="flex flex-wrap gap-2">{transfer.status === 'DRAFT' && <button className={buttonClass} disabled={saving} onClick={() => void perform(() => foundationApi.dispatchWarehouseTransfer(transfer.id, csrf), 'کالا از موجودی مبدأ خارج و انتقال در مسیر ثبت شد.')}>خروج از مبدأ</button>}{transfer.status === 'IN_TRANSIT' && <button className={buttonClass} disabled={saving} onClick={() => void perform(() => foundationApi.receiveWarehouseTransfer(transfer.id, csrf), 'کل انتقال در مقصد دریافت شد.')}>دریافت کامل</button>}{transfer.status !== 'CANCELLED' && <ReasonAction label="برگشت کامل" busy={saving} onConfirm={(reversalReason) => void perform(() => foundationApi.reverseWarehouseTransfer(transfer.id, reversalReason, csrf), 'کل انتقال به‌صورت یکپارچه برگشت داده شد.')} />}</div></div>)}</div></Card></div>;
}

function AdjustmentsSection({ data, csrf, owner, permissions, saving, perform, itemName, locationName, positive }: SectionProps & { itemName: (id: string) => string; locationName: (id: string) => string; positive: (v: string) => boolean }) {
  const [balanceKey, setBalanceKey] = useState(''); const [direction, setDirection] = useState<'IN'|'OUT'>('IN'); const [quantity, setQuantity] = useState('1'); const [reason, setReason] = useState(''); const [evidence, setEvidence] = useState(''); const balance = data.balances.find((entry) => `${entry.locationId}:${entry.stockIdentityId}` === balanceKey);
  const canCreate = permissions.includes('warehouse.adjustment.create');
  const canApprove = permissions.includes('warehouse.adjustment.approve');
  return <ControlLayout title="ایجاد اصلاح موجودی" rows={data.adjustments} saving={saving} create={canCreate ? <>
    <div className="grid gap-3 md:grid-cols-3"><Field label="موجودی"><select className={inputClass} value={balanceKey} onChange={(e) => setBalanceKey(e.target.value)}><option value="">انتخاب موجودی</option>{data.balances.map((entry) => <option key={`${entry.locationId}:${entry.stockIdentityId}`} value={`${entry.locationId}:${entry.stockIdentityId}`}>{itemName(entry.inventoryItemId)} · {locationName(entry.locationId)} · {entry.onHandQuantity}</option>)}</select></Field><Field label="جهت"><select className={inputClass} value={direction} onChange={(e) => setDirection(e.target.value as 'IN'|'OUT')}><option value="IN">افزایش</option><option value="OUT">کاهش</option></select></Field><Field label="مقدار"><input className={inputClass} dir="ltr" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field><Field label="دلیل"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><Field label="مدرک/شاهد"><input className={inputClass} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></Field></div>
    <button className={`${buttonClass} mt-3`} disabled={saving || !balance || !positive(quantity) || reason.length < 3 || evidence.length < 3} onClick={() => balance && void perform(() => foundationApi.createInventoryAdjustment({ ...owner, warehouseId: balance.warehouseId, locationId: balance.locationId, reason, evidenceNote: evidence, lines: [{ stockIdentityId: balance.stockIdentityId, direction, quantity }] }, csrf), 'اصلاح موجودی برای بررسی ثبت شد.')}>ایجاد اصلاح</button>
  </> : <Empty text="در این نقش فقط موارد منتظر تأیید نمایش داده می‌شوند." />} actions={(row) => <>{canCreate && row.status === 'DRAFT' && <button className={secondaryButtonClass} disabled={saving} onClick={() => void perform(() => foundationApi.submitInventoryAdjustment(row.id, csrf), 'اصلاح برای تأیید ارسال شد.')}>ارسال برای تأیید</button>}{canApprove && row.status === 'SUBMITTED' && <button className={buttonClass} disabled={saving} onClick={() => void perform(() => foundationApi.approveInventoryAdjustment(row.id, csrf), 'اصلاح توسط تأییدکننده مستقل ثبت قطعی شد.')}>تأیید و ثبت</button>}</>} />;
}

function CountsSection({ data, csrf, owner, permissions, saving, perform, itemName, locationName, positive }: SectionProps & { itemName: (id: string) => string; locationName: (id: string) => string; positive: (v: string) => boolean }) {
  const [balanceKey, setBalanceKey] = useState(''); const [actual, setActual] = useState('0'); const [reason, setReason] = useState(''); const balance = data.balances.find((entry) => `${entry.locationId}:${entry.stockIdentityId}` === balanceKey);
  const canCreate = permissions.includes('warehouse.count.create');
  const canApprove = permissions.includes('warehouse.count.approve');
  return <ControlLayout title="ثبت شمارش موجودی" rows={data.counts} saving={saving} create={canCreate ? <>
    <div className="grid gap-3 md:grid-cols-3"><Field label="موجودی"><select className={inputClass} value={balanceKey} onChange={(e) => { setBalanceKey(e.target.value); const selected = data.balances.find((entry) => `${entry.locationId}:${entry.stockIdentityId}` === e.target.value); if (selected) setActual(selected.onHandQuantity); }}><option value="">انتخاب موجودی</option>{data.balances.map((entry) => <option key={`${entry.locationId}:${entry.stockIdentityId}`} value={`${entry.locationId}:${entry.stockIdentityId}`}>{itemName(entry.inventoryItemId)} · {locationName(entry.locationId)} · سامانه {entry.onHandQuantity}</option>)}</select></Field><Field label="مقدار شمارش‌شده"><input className={inputClass} dir="ltr" value={actual} onChange={(e) => setActual(e.target.value)} /></Field><Field label="دلیل شمارش"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field></div>
    <button className={`${buttonClass} mt-3`} disabled={saving || !balance || !quantityPattern.test(actual) || reason.length < 3} onClick={() => balance && void perform(() => foundationApi.createInventoryCount({ ...owner, warehouseId: balance.warehouseId, locationId: balance.locationId, reason, lines: [{ stockIdentityId: balance.stockIdentityId, actualQuantity: actual }] }, csrf), 'شمارش ثبت شد و منتظر تأیید مستقل است.')}>ثبت شمارش</button>
  </> : <Empty text="در این نقش فقط شمارش‌های منتظر تأیید نمایش داده می‌شوند." />} actions={(row) => <>{canCreate && row.status === 'OPEN' && <button className={secondaryButtonClass} disabled={saving} onClick={() => void perform(() => foundationApi.submitInventoryCount(row.id, csrf), 'شمارش برای تأیید ارسال شد.')}>ارسال برای تأیید</button>}{canApprove && row.status === 'SUBMITTED' && <button className={buttonClass} disabled={saving} onClick={() => void perform(() => foundationApi.approveInventoryCount(row.id, csrf), 'اختلاف شمارش با موجودی قفل‌شده ثبت شد.')}>تأیید و ثبت</button>}</>} />;
}

function ControlLayout<T extends { id: string; status: string; reason: string; createdAt: string }>({ title, rows, saving, create, actions }: { title: string; rows: T[]; saving: boolean; create: ReactNode; actions: (row: T) => ReactNode }) {
  return <div className="space-y-4"><Card title={title}>{create}</Card><Card title="کارتابل کنترل"><div className="space-y-2">{rows.map((row) => <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><b>{warehouseStatusLabel(row.status)}</b><div className="text-xs text-slate-500">{row.reason} · {localDate(row.createdAt)}</div></div><div className="flex gap-2" aria-disabled={saving}>{actions(row)}</div></div>)}{!rows.length && <Empty text="موردی در کارتابل وجود ندارد." />}</div></Card></div>;
}

function ReturnsSection({ data, csrf, owner, saving, perform, warehouseName, itemName, positive, invoices }: SectionProps & { warehouseName: (id: string) => string; itemName: (id: string) => string; positive: (v: string) => boolean; invoices: FoundationSalesInvoice[] }) {
  const [warehouseId, setWarehouseId] = useState(''); const [locationId, setLocationId] = useState(''); const [itemId, setItemId] = useState(''); const [quantity, setQuantity] = useState('1'); const [reason, setReason] = useState(''); const [evidence, setEvidence] = useState(''); const [invoiceId, setInvoiceId] = useState(''); const [lotCode, setLotCode] = useState(''); const [serialCode, setSerialCode] = useState('');
  const [lineId, setLineId] = useState(''); const [disposition, setDisposition] = useState<InventoryReturnDisposition>('SELLABLE'); const [destinationId, setDestinationId] = useState(''); const [inspectionQuantity, setInspectionQuantity] = useState('1'); const [inspectionReason, setInspectionReason] = useState('');
  const item = data.items.find((entry) => entry.id === itemId); const returnLine = data.returnLines.find((entry) => entry.id === lineId); const header = data.returns.find((entry) => entry.id === returnLine?.returnId);
  const selectedInvoice = invoices.find((invoice) => invoice.id === invoiceId);
  const requiredLocationType = disposition === 'QUARANTINE' ? 'QUARANTINE' : disposition === 'DAMAGED' ? 'DAMAGED' : 'SELLABLE';
  const needsDestination = ['SELLABLE','QUARANTINE','DAMAGED'].includes(disposition);
  return <div className="space-y-4"><Card title="ثبت برگشتی"><div className="grid gap-3 md:grid-cols-3"><Field label="انبار"><select className={inputClass} value={warehouseId} onChange={(e) => { setWarehouseId(e.target.value); setLocationId(''); }}><option value="">انتخاب انبار</option>{data.warehouses.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field><Field label="محل ورود برگشتی"><select className={inputClass} value={locationId} onChange={(e) => setLocationId(e.target.value)}><option value="">انتخاب محل</option>{data.locations.filter((entry) => entry.warehouseId === warehouseId && entry.locationType === 'RETURNS').map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field><Field label="کالا"><select className={inputClass} value={itemId} onChange={(e) => setItemId(e.target.value)}><option value="">انتخاب کالا</option>{data.items.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field><Field label="مقدار"><input className={inputClass} dir="ltr" value={quantity} onChange={(e) => setQuantity(e.target.value)} /></Field>{item?.trackingMode === 'LOT' && <Field label="کد بچ/سری ساخت"><input className={inputClass} value={lotCode} onChange={(e) => setLotCode(e.target.value)} /></Field>}{item?.trackingMode === 'SERIAL' && <Field label="شماره سریال"><input className={inputClass} value={serialCode} onChange={(e) => setSerialCode(e.target.value)} /></Field>}{invoices.length > 0 && <Field label="فاکتور مرتبط (اختیاری)"><select className={inputClass} value={invoiceId} onChange={(event) => setInvoiceId(event.target.value)}><option value="">بدون اتصال به فاکتور</option>{invoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.code} · {invoice.sale.customer.name}</option>)}</select></Field>}<Field label="دلیل"><input className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field><Field label="مدرک/شاهد"><input className={inputClass} value={evidence} onChange={(e) => setEvidence(e.target.value)} /></Field></div><button className={`${buttonClass} mt-3`} disabled={saving || !warehouseId || !locationId || !itemId || !positive(quantity) || reason.length < 3 || evidence.length < 3} onClick={() => void perform(() => foundationApi.createInventoryReturn({ ...owner, warehouseId, returnsLocationId: locationId, customerId: selectedInvoice?.sale.customer.id, invoiceId: selectedInvoice?.id, reason, evidenceNote: evidence, lines: [{ inventoryItemId: itemId, quantity, lotCode: lotCode || undefined, serialCode: serialCode || undefined }] }, csrf), 'برگشتی در حالت پیش‌نویس ثبت شد.')}>ثبت برگشتی</button></Card>
    <Card title="دریافت و بازرسی"><div className="space-y-2">{data.returns.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"><div><b>{warehouseName(entry.warehouseId)}</b><div className="text-xs text-slate-500">{statusLabels[entry.status]} · {entry.reason}</div></div>{entry.status === 'DRAFT' && <button className={buttonClass} disabled={saving} onClick={() => void perform(() => foundationApi.receiveInventoryReturn(entry.id, csrf), 'کالای برگشتی در محل برگشتی دریافت شد.')}>ثبت دریافت</button>}</div>)}</div><div className="mt-4 grid gap-3 border-t pt-4 md:grid-cols-3"><Field label="ردیف دریافت‌شده"><select className={inputClass} value={lineId} onChange={(e) => { setLineId(e.target.value); setDestinationId(''); }}><option value="">انتخاب ردیف</option>{data.returnLines.filter((line) => line.stockIdentityId).map((line) => <option key={line.id} value={line.id}>{itemName(line.inventoryItemId)} · {line.quantity}</option>)}</select></Field><Field label="نتیجه بازرسی"><select className={inputClass} value={disposition} onChange={(e) => { setDisposition(e.target.value as InventoryReturnDisposition); setDestinationId(''); }}>{(['SELLABLE','QUARANTINE','DAMAGED','RETURN_TO_SUPPLIER','SCRAP'] as InventoryReturnDisposition[]).map((entry) => <option key={entry} value={entry}>{statusLabels[entry]}</option>)}</select></Field><Field label="مقدار"><input className={inputClass} dir="ltr" value={inspectionQuantity} onChange={(e) => setInspectionQuantity(e.target.value)} /></Field>{needsDestination && <Field label="محل مقصد"><select className={inputClass} value={destinationId} onChange={(e) => setDestinationId(e.target.value)}><option value="">انتخاب محل</option>{data.locations.filter((entry) => entry.warehouseId === header?.warehouseId && entry.locationType === requiredLocationType).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></Field>}<Field label="توضیح بازرسی"><input className={inputClass} value={inspectionReason} onChange={(e) => setInspectionReason(e.target.value)} /></Field></div><button className={`${buttonClass} mt-3`} disabled={saving || !returnLine || !positive(inspectionQuantity) || inspectionReason.length < 3 || (needsDestination && !destinationId)} onClick={() => returnLine && void perform(() => foundationApi.inspectInventoryReturnLine(returnLine.returnId, returnLine.id, { disposition, quantity: inspectionQuantity, destinationLocationId: needsDestination ? destinationId : undefined, reason: inspectionReason }, csrf), 'نتیجه بازرسی و اثر موجودی آن ثبت شد.')}>ثبت نتیجه بازرسی</button></Card></div>;
}
