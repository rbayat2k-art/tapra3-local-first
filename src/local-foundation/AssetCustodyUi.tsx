import {useMemo, useState} from 'react';
import {CheckCircle2, KeyRound, PackageCheck, RotateCcw, ShieldCheck, X} from 'lucide-react';
import type {FoundationState, OperationalRecord} from './model';
import type {AssetCustodyInput, LocalAssetCustodyChallenge, LocalFoundationService} from './service';
import {formatPersianDateTime} from './PersianDate';

interface CommonProps {
  state: FoundationState;
  service: LocalFoundationService;
  execute: (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;
}

export function AssetCustodyEditor({state, service, execute, onClose}: CommonProps & {onClose: () => void}) {
  const [action, setAction] = useState<'delivery' | 'return'>('delivery');
  const [assetId, setAssetId] = useState('');
  const [personnelId, setPersonnelId] = useState('');
  const [notes, setNotes] = useState('');
  const [challenge, setChallenge] = useState<LocalAssetCustodyChallenge | null>(null);
  const [error, setError] = useState('');
  const assets = useMemo(() => state.operationalRecords.filter((item) => item.moduleId === 'fixed-asset' && item.status !== 'disposed' && (action === 'delivery' ? !item.payload.custodianPersonnelId : Boolean(item.payload.custodianPersonnelId))), [action, state.operationalRecords]);
  const personnel = useMemo(() => state.personnel.filter((item) => action === 'delivery' ? item.employmentStatus === 'active' : true), [action, state.personnel]);

  const start = async () => {
    setError('');
    if (!assetId || !personnelId) { setError('دارایی و پرسنل را انتخاب کنید.'); return; }
    let created: LocalAssetCustodyChallenge | null = null;
    const input: AssetCustodyInput = {assetRecordId: assetId, personnelId, action, notes};
    const ok = await execute('asset-custody-start', async () => {
      created = await service.createAssetCustodyChallenge(input);
      return created.state;
    }, `فرایند ${action === 'delivery' ? 'تحویل' : 'عودت'} دارایی ایجاد شد.`);
    if (ok && created) setChallenge(created);
  };

  return <div className="modal-backdrop" onMouseDown={(event) => {if (event.currentTarget === event.target) onClose();}}>
    <section className="dialog asset-custody-dialog" role="dialog" aria-modal="true" aria-label="تحویل و عودت دارایی">
      <header className="dialog__header"><div><span className="eyebrow">دارایی‌ها و اموال</span><h2>ثبت تحویل یا عودت دارایی</h2><p>تحویل فقط پس از تأیید شخص و مسئول اموال قطعی می‌شود.</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
      {!challenge ? <div className="dialog__body form-stack">
        {error && <div className="validation-summary">{error}</div>}
        <div className="segmented-control"><button className={action === 'delivery' ? 'active' : ''} onClick={() => {setAction('delivery');setAssetId('');setPersonnelId('');}}><PackageCheck size={17}/> تحویل دارایی</button><button className={action === 'return' ? 'active' : ''} onClick={() => {setAction('return');setAssetId('');setPersonnelId('');}}><RotateCcw size={17}/> عودت دارایی</button></div>
        <label className="field"><span>دارایی <b className="required-star">*</b></span><select value={assetId} onChange={(event) => {const id = event.target.value; setAssetId(id); const asset = assets.find((item) => item.id === id); if (action === 'return' && asset?.payload.custodianPersonnelId) setPersonnelId(String(asset.payload.custodianPersonnelId));}}><option value="">انتخاب دارایی...</option>{assets.map((asset) => <option value={asset.id} key={asset.id}>{asset.title} — {asset.trackingCode}</option>)}</select></label>
        <label className="field"><span>پرسنل تحویل‌گیرنده/تحویل‌دهنده <b className="required-star">*</b></span><select value={personnelId} disabled={action === 'return' && Boolean(assetId)} onChange={(event) => setPersonnelId(event.target.value)}><option value="">انتخاب پرسنل...</option>{personnel.map((person) => <option value={person.id} key={person.id}>{person.firstName} {person.lastName} — {person.personnelCode}</option>)}</select></label>
        <label className="field"><span>توضیحات (اختیاری)</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="وضعیت فیزیکی، لوازم همراه یا توضیح تکمیلی..."/></label>
      </div> : <div className="dialog__body form-stack">
        <div className="success-panel"><ShieldCheck size={23}/><div><strong>فرایند ایجاد شد</strong><span>این رمزها فقط برای آزمون محلی نمایش داده می‌شوند و در پایگاه داده ذخیره نمی‌شوند.</span></div></div>
        <div className="asset-otp-grid"><div><span>رمز پرسنل</span><strong dir="ltr">{challenge.employeeOtp}</strong></div><div><span>رمز مسئول اموال</span><strong dir="ltr">{challenge.officerOtp}</strong></div></div>
        <small>اعتبار تا {formatPersianDateTime(challenge.expiresAt)}</small>
      </div>}
      <footer className="dialog__footer">{challenge ? <button className="button button--primary" onClick={onClose}>مشاهده و ثبت تأییدها</button> : <button className="button button--primary" onClick={() => void start()}><KeyRound size={18}/> ایجاد و دریافت رمزهای تأیید</button>}<button className="button button--ghost" onClick={onClose}>بستن</button></footer>
    </section>
  </div>;
}

export function AssetCustodyDrawer({state, record, service, execute, onClose}: CommonProps & {record: OperationalRecord; onClose: () => void}) {
  const [employeeOtp, setEmployeeOtp] = useState('');
  const [officerOtp, setOfficerOtp] = useState('');
  const asset = state.operationalRecords.find((item) => item.id === record.relatedRecordId);
  const person = state.personnel.find((item) => item.id === record.ownerPersonnelId);
  const employeeConfirmed = record.payload.employeeConfirmed === true;
  const officerConfirmed = record.payload.officerConfirmed === true;
  const confirm = async (party: 'employee' | 'officer') => {
    const otp = party === 'employee' ? employeeOtp : officerOtp;
    if (!/^\d{6}$/.test(otp)) return;
    const ok = await execute(`asset-custody-${party}`, () => service.confirmAssetCustodyOtp(record.id, party, otp), party === 'employee' ? 'تأیید پرسنل ثبت شد.' : 'تأیید مسئول اموال ثبت شد.');
    if (ok) party === 'employee' ? setEmployeeOtp('') : setOfficerOtp('');
  };
  return <div className="drawer-scrim" onMouseDown={(event) => {if (event.currentTarget === event.target) onClose();}}><aside className="record-drawer asset-custody-drawer">
    <header><div><span className="eyebrow">{record.trackingCode}</span><h2>{record.title}</h2></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header>
    <div className="drawer-body form-stack">
      <div className="record-facts"><div><span>دارایی</span><strong>{asset?.title ?? 'نامشخص'}</strong></div><div><span>پرسنل</span><strong>{person ? `${person.firstName} ${person.lastName}` : 'نامشخص'}</strong></div><div><span>نوع عملیات</span><strong>{record.payload.action === 'return' ? 'عودت' : 'تحویل'}</strong></div></div>
      <div className="asset-confirmation-status"><Status confirmed={employeeConfirmed} label="تأیید پرسنل"/><Status confirmed={officerConfirmed} label="تأیید مسئول اموال"/></div>
      {record.status !== 'completed' && <>
        {!employeeConfirmed && <label className="field"><span>رمز شش‌رقمی پرسنل</span><div className="inline-confirm"><input dir="ltr" inputMode="numeric" maxLength={6} value={employeeOtp} onChange={(event) => setEmployeeOtp(event.target.value.replace(/\D/g, ''))}/><button className="button button--secondary" disabled={employeeOtp.length !== 6} onClick={() => void confirm('employee')}>ثبت تأیید پرسنل</button></div></label>}
        {!officerConfirmed && <label className="field"><span>رمز شش‌رقمی مسئول اموال</span><div className="inline-confirm"><input dir="ltr" inputMode="numeric" maxLength={6} value={officerOtp} onChange={(event) => setOfficerOtp(event.target.value.replace(/\D/g, ''))}/><button className="button button--secondary" disabled={officerOtp.length !== 6} onClick={() => void confirm('officer')}>ثبت تأیید مسئول اموال</button></div></label>}
      </>}
      {record.status === 'completed' && <div className="success-panel"><CheckCircle2 size={22}/><div><strong>تحویل دوطرفه قطعی شده است</strong><span>زمان، عامل و سابقه در رویدادهای ممیزی نگهداری شده‌اند.</span></div></div>}
    </div>
    <footer className="drawer-footer"><button className="button button--ghost" onClick={onClose}>بستن</button></footer>
  </aside></div>;
}

function Status({confirmed, label}: {confirmed: boolean; label: string}) {return <div className={confirmed ? 'confirmed' : ''}><CheckCircle2 size={18}/><span>{label}</span><strong>{confirmed ? 'ثبت شده' : 'در انتظار'}</strong></div>}
