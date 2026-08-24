import {useMemo, useState} from 'react';
import {AlertTriangle, CheckCircle2, Eye, FileClock, History, KeyRound, PackageCheck, RotateCcw, ShieldCheck, Wrench, X} from 'lucide-react';
import type {FoundationState, OperationalRecord} from './model';
import type {LocalAssetCustodyChallenge, LocalFoundationService, OwnAssetIssueInput} from './service';
import {formatPersianDateTime} from './PersianDate';

type Execute = (label: string, work: () => Promise<FoundationState>, success: string) => Promise<boolean>;

interface Props {
  state: FoundationState;
  service: LocalFoundationService;
  execute: Execute;
  personnelId: string;
  readOnly: boolean;
}

export function MyAssetsSection({state, service, execute, personnelId, readOnly}: Props) {
  const [selectedAsset, setSelectedAsset] = useState<OperationalRecord>();
  const [returnAsset, setReturnAsset] = useState<OperationalRecord>();
  const [issueAsset, setIssueAsset] = useState<OperationalRecord>();
  const [otpValues, setOtpValues] = useState<Record<string, string>>({});
  const assetsById = useMemo(() => new Map(state.operationalRecords.filter((item) => item.moduleId === 'fixed-asset').map((item) => [item.id, item])), [state.operationalRecords]);
  const transfers = useMemo(() => state.operationalRecords.filter((item) => item.moduleId === 'asset-transfer' && item.ownerPersonnelId === personnelId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [personnelId, state.operationalRecords]);
  const currentAssets = useMemo(() => [...assetsById.values()].filter((item) => item.status !== 'disposed' && item.payload.custodianPersonnelId === personnelId).sort((a, b) => a.title.localeCompare(b.title, 'fa')), [assetsById, personnelId]);
  const reports = useMemo(() => state.operationalRecords.filter((item) => item.moduleId === 'asset-maintenance' && item.ownerPersonnelId === personnelId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [personnelId, state.operationalRecords]);
  const pending = transfers.filter((item) => ['submitted', 'approved'].includes(item.status));
  const pendingForAsset = (assetId: string) => pending.some((item) => item.relatedRecordId === assetId);

  const confirmEmployee = async (transfer: OperationalRecord) => {
    const otp = otpValues[transfer.id] ?? '';
    if (!/^\d{6}$/.test(otp)) return;
    const ok = await execute('my-asset-confirm', () => service.confirmAssetCustodyOtp(transfer.id, 'employee', otp), 'تأیید شما برای تحویل یا عودت دارایی ثبت شد.');
    if (ok) setOtpValues((current) => ({...current, [transfer.id]: ''}));
  };
  const issueEmployeeOtp = async (transfer: OperationalRecord) => {
    let challenge: LocalAssetCustodyChallenge | undefined;
    const ok = await execute('my-asset-otp', async () => { challenge = await service.issueAssetCustodyOtp(transfer.id, 'employee'); return challenge.state; }, 'رمز یک‌بارمصرف مخصوص شما صادر شد.');
    if (ok && challenge) setOtpValues((current) => ({...current, [transfer.id]: challenge!.otp}));
  };

  return <>
    <section className="my-assets-overview">
      <div className="my-assets-metrics">
        <Metric icon={PackageCheck} label="در اختیار من" value={currentAssets.length}/>
        <Metric icon={KeyRound} label="در انتظار تأیید من" value={pending.filter((item) => item.payload.employeeConfirmed !== true).length}/>
        <Metric icon={History} label="سوابق تحویل و عودت" value={transfers.length}/>
        <Metric icon={Wrench} label="گزارش‌های ثبت‌شده" value={reports.length}/>
      </div>

      {pending.length > 0 && <div className="my-assets-pending">
        <div className="my-assets-block-title"><div><strong>نیازمند اقدام من</strong><small>رمز ارسال‌شده برای شما را وارد کنید؛ تأیید مسئول اموال همچنان مستقل باقی می‌ماند.</small></div><KeyRound size={20}/></div>
        {pending.map((transfer) => {
          const asset = transfer.relatedRecordId ? assetsById.get(transfer.relatedRecordId) : undefined;
          const employeeConfirmed = transfer.payload.employeeConfirmed === true;
          return <article key={transfer.id} className="my-asset-pending-row">
            <div><strong>{transfer.payload.action === 'return' ? 'عودت' : 'تحویل'} {asset?.title ?? 'دارایی'}</strong><small>{transfer.trackingCode} · ثبت در {formatPersianDateTime(transfer.createdAt)}</small></div>
            {employeeConfirmed ? <span className="state-badge state-badge--progress"><CheckCircle2 size={14}/> تأیید شما ثبت شده؛ منتظر مسئول اموال</span> : readOnly ? <span className="state-badge">در حالت مشاهده فقط‌خواندنی</span> : <div className="my-asset-otp"><input aria-label={`رمز تأیید ${asset?.title ?? 'دارایی'}`} dir="ltr" inputMode="numeric" maxLength={6} placeholder="رمز ۶ رقمی" value={otpValues[transfer.id] ?? ''} onChange={(event) => setOtpValues((current) => ({...current, [transfer.id]: event.target.value.replace(/\D/g, '')}))}/><button className="button button--secondary" type="button" onClick={() => void issueEmployeeOtp(transfer)}>دریافت رمز من</button><button className="button button--secondary" disabled={(otpValues[transfer.id] ?? '').length !== 6} onClick={() => void confirmEmployee(transfer)}>ثبت تأیید من</button></div>}
          </article>;
        })}
      </div>}

      <div className="my-assets-block-title"><div><strong>دارایی‌های تحت اختیار من</strong><small>فقط دارایی‌هایی نمایش داده می‌شوند که تحویل دوطرفه آن‌ها به پرونده شما قطعی شده است.</small></div><PackageCheck size={20}/></div>
      {currentAssets.length ? <div className="my-assets-table-wrap"><table className="my-assets-table"><thead><tr><th>ردیف</th><th>دارایی</th><th>کد / سریال</th><th>وضعیت</th><th>تاریخ تحویل</th><th>اقدام‌ها</th></tr></thead><tbody>{currentAssets.map((asset, index) => {
        const delivery = transfers.find((item) => item.relatedRecordId === asset.id && item.payload.action === 'delivery' && item.status === 'completed');
        return <tr key={asset.id}><td>{(index + 1).toLocaleString('en-US')}</td><td><strong>{asset.title}</strong><small>{payloadText(asset, 'category') || asset.description || 'بدون توضیح تکمیلی'}</small></td><td><code dir="ltr">{asset.trackingCode}</code><small dir="ltr">{payloadText(asset, 'serialNumber') || 'سریال ثبت نشده'}</small></td><td><span className="state-badge state-badge--good">در اختیار من</span></td><td>{formatPersianDateTime(String(asset.payload.lastCustodyChangedAt || delivery?.updatedAt || asset.updatedAt))}</td><td><div className="icon-actions"><button className="icon-button" title="مشاهده جزئیات و رسید تحویل" aria-label="مشاهده جزئیات و رسید تحویل" onClick={() => setSelectedAsset(asset)}><Eye size={17}/></button><button className="icon-button" title="گزارش خرابی، مفقودی یا مشکل" aria-label="گزارش خرابی، مفقودی یا مشکل" disabled={readOnly} onClick={() => setIssueAsset(asset)}><AlertTriangle size={17}/></button><button className="icon-button" title="درخواست عودت دارایی" aria-label="درخواست عودت دارایی" disabled={readOnly || pendingForAsset(asset.id)} onClick={() => setReturnAsset(asset)}><RotateCcw size={17}/></button></div></td></tr>;
      })}</tbody></table></div> : <div className="compact-empty my-assets-empty"><PackageCheck size={24}/><span>در حال حاضر دارایی قطعی‌شده‌ای تحت اختیار شما ثبت نشده است.</span></div>}

      {transfers.length > 0 && <details className="my-assets-history"><summary><span><History size={18}/> تاریخچه تحویل و عودت</span><small>{transfers.length.toLocaleString('en-US')} رویداد</small></summary><div className="my-assets-history-list">{transfers.map((transfer, index) => {const asset = transfer.relatedRecordId ? assetsById.get(transfer.relatedRecordId) : undefined; return <article key={transfer.id}><b>{(index + 1).toLocaleString('en-US')}</b><div><strong>{transfer.payload.action === 'return' ? 'عودت' : 'تحویل'} {asset?.title ?? 'دارایی'}</strong><small>{transfer.trackingCode} · {formatPersianDateTime(transfer.updatedAt)}</small></div><span className={`state-badge state-badge--${transfer.status === 'completed' ? 'good' : 'progress'}`}>{transfer.status === 'completed' ? 'قطعی‌شده' : 'در انتظار تأیید'}</span></article>;})}</div></details>}
    </section>

    {selectedAsset && <AssetDetailsDialog asset={selectedAsset} transfers={transfers.filter((item) => item.relatedRecordId === selectedAsset.id)} reports={reports.filter((item) => item.relatedRecordId === selectedAsset.id)} onClose={() => setSelectedAsset(undefined)}/>} 
    {returnAsset && <AssetReturnDialog asset={returnAsset} personnelId={personnelId} service={service} execute={execute} onClose={() => setReturnAsset(undefined)}/>} 
    {issueAsset && <AssetIssueDialog asset={issueAsset} service={service} execute={execute} onClose={() => setIssueAsset(undefined)}/>} 
  </>;
}

function Metric({icon: Icon, label, value}: {icon: typeof PackageCheck; label: string; value: number}) {return <div><i><Icon size={18}/></i><span>{label}</span><strong>{value.toLocaleString('en-US')}</strong></div>;}

function AssetDetailsDialog({asset, transfers, reports, onClose}: {asset: OperationalRecord; transfers: OperationalRecord[]; reports: OperationalRecord[]; onClose: () => void}) {
  return <div className="modal-scrim"><section className="dialog my-asset-detail-dialog"><header><div><span className="eyebrow">{asset.trackingCode}</span><h2>{asset.title}</h2><p>مشخصات، رسیدهای تحویل و سابقه نگهداری این دارایی</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="dialog-body form-stack">
    <div className="record-facts"><div><span>شماره سریال</span><strong dir="ltr">{payloadText(asset, 'serialNumber') || 'ثبت نشده'}</strong></div><div><span>دسته‌بندی</span><strong>{payloadText(asset, 'category') || 'ثبت نشده'}</strong></div><div><span>برند / مدل</span><strong>{[payloadText(asset, 'brand'), payloadText(asset, 'model')].filter(Boolean).join(' / ') || 'ثبت نشده'}</strong></div><div><span>وضعیت هنگام تحویل</span><strong>{payloadText(asset, 'deliveryCondition') || payloadText(asset, 'condition') || 'ثبت نشده'}</strong></div><div><span>لوازم جانبی</span><strong>{payloadText(asset, 'accessories') || 'ثبت نشده'}</strong></div><div><span>وضعیت فعلی</span><strong>در اختیار شما</strong></div></div>
    {asset.description && <div className="notice notice--info"><ShieldCheck size={18}/><span>{asset.description}</span></div>}
    <div className="my-asset-receipts"><h3>رسیدها و تأییدها</h3>{transfers.length ? transfers.map((transfer) => <article key={transfer.id}><FileClock size={19}/><div><strong>{transfer.payload.action === 'return' ? 'رسید عودت' : 'رسید تحویل'} · {transfer.trackingCode}</strong><small>{formatPersianDateTime(transfer.updatedAt)} · تأیید پرسنل: {transfer.payload.employeeConfirmed === true ? 'ثبت شده' : 'در انتظار'} · تأیید مسئول اموال: {transfer.payload.officerConfirmed === true ? 'ثبت شده' : 'در انتظار'}</small></div></article>) : <p>رسیدی ثبت نشده است.</p>}</div>
    {reports.length > 0 && <div className="my-asset-receipts"><h3>گزارش‌های مشکل</h3>{reports.map((report) => <article key={report.id}><AlertTriangle size={19}/><div><strong>{report.title}</strong><small>{report.description} · {formatPersianDateTime(report.createdAt)}</small></div></article>)}</div>}
  </div><footer><button className="button button--secondary" onClick={onClose}>بستن</button></footer></section></div>;
}

function AssetReturnDialog({asset, personnelId, service, execute, onClose}: {asset: OperationalRecord; personnelId: string; service: LocalFoundationService; execute: Execute; onClose: () => void}) {
  const [notes, setNotes] = useState(''); const [challenge, setChallenge] = useState<LocalAssetCustodyChallenge>(); const [employeeOtp, setEmployeeOtp] = useState('');
  const start = async () => {let created: LocalAssetCustodyChallenge | undefined; const ok = await execute('my-asset-return', async () => {created = await service.createAssetCustodyChallenge({assetRecordId: asset.id, personnelId, action: 'return', notes}); return created.state;}, 'درخواست عودت دارایی ثبت و به مسئول اموال اعلام شد.'); if (ok && created) {setChallenge(created);setEmployeeOtp(created.otp);}};
  const confirm = async () => {if (!challenge || employeeOtp.length !== 6) return; const ok = await execute('my-asset-return-confirm', () => service.confirmAssetCustodyOtp(challenge!.transferId, 'employee', employeeOtp), 'تأیید عودت شما ثبت شد؛ پرونده منتظر تأیید مسئول اموال است.'); if (ok) onClose();};
  return <div className="modal-scrim"><section className="dialog my-asset-action-dialog"><header><div><span className="eyebrow">خودخدمتی اموال</span><h2>درخواست عودت {asset.title}</h2><p>دارایی تا تأیید هر دو طرف همچنان تحت اختیار شما باقی می‌ماند.</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="dialog-body form-stack">{!challenge ? <label className="field"><span>توضیحات و وضعیت فیزیکی (اختیاری)</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="لوازم همراه یا توضیح لازم برای تحویل..."/></label> : <><div className="success-panel"><ShieldCheck size={21}/><div><strong>درخواست عودت ثبت شد</strong><span>در نسخه محلی، رمز آزمایشی شما در همین فرم قرار گرفته است.</span></div></div><label className="field"><span>رمز شش‌رقمی تأیید شما</span><input dir="ltr" inputMode="numeric" maxLength={6} value={employeeOtp} onChange={(event) => setEmployeeOtp(event.target.value.replace(/\D/g, ''))}/></label></>}</div><footer><button className="button button--secondary" onClick={onClose}>انصراف</button>{challenge ? <button className="button button--primary" disabled={employeeOtp.length !== 6} onClick={() => void confirm()}><CheckCircle2 size={17}/> تأیید عودت توسط من</button> : <button className="button button--primary" onClick={() => void start()}><RotateCcw size={17}/> ثبت درخواست عودت</button>}</footer></section></div>;
}

function AssetIssueDialog({asset, service, execute, onClose}: {asset: OperationalRecord; service: LocalFoundationService; execute: Execute; onClose: () => void}) {
  const [issueType, setIssueType] = useState<OwnAssetIssueInput['issueType']>('damage'); const [description, setDescription] = useState(''); const [error, setError] = useState('');
  const submit = async () => {if (description.trim().length < 5) {setError('شرح مشکل را با حداقل ۵ نویسه وارد کنید.');return;} const ok = await execute('my-asset-issue', () => service.reportOwnAssetIssue({assetRecordId: asset.id, issueType, description}), 'گزارش دارایی ثبت و برای مسئول اموال ارسال شد.'); if (ok) onClose();};
  return <div className="modal-scrim"><section className="dialog my-asset-action-dialog"><header><div><span className="eyebrow">گزارش وضعیت دارایی</span><h2>{asset.title}</h2><p>این گزارش در سابقه دارایی و پرونده شما باقی می‌ماند.</p></div><button className="icon-button" onClick={onClose} aria-label="بستن"><X size={20}/></button></header><div className="dialog-body form-stack">{error && <div className="validation-summary">{error}</div>}<label className="field"><span>نوع گزارش</span><select value={issueType} onChange={(event) => setIssueType(event.target.value as OwnAssetIssueInput['issueType'])}><option value="damage">خرابی یا آسیب</option><option value="lost">مفقودی</option><option value="other">سایر مشکلات</option></select></label><label className="field"><span>شرح مشکل <b className="required-star">*</b></span><textarea rows={4} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="مشکل، زمان مشاهده و وضعیت فعلی را بنویسید..."/></label></div><footer><button className="button button--secondary" onClick={onClose}>انصراف</button><button className="button button--primary" onClick={() => void submit()}><AlertTriangle size={17}/> ثبت و ارسال گزارش</button></footer></section></div>;
}

function payloadText(record: OperationalRecord, key: string): string {const value = record.payload[key]; return typeof value === 'string' || typeof value === 'number' ? String(value) : '';}
