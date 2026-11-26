import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalState } from './files-stub';
import { LL, Place, Route, TRIPOLI, along, bearing, fetchRoute, offset, reverse, searchPlaces } from './geo';
import { MapView } from './MapView';

type Tab = 'ride' | 'trips' | 'wallet' | 'me';
type Phase = 'idle' | 'plan' | 'searching' | 'enroute' | 'arrived' | 'ontrip' | 'done';
type Ride = { id: string; name: string; sub: string; seats: number; base: number; km: number; min: number; mult: number };
type Trip = { id: number; from: string; to: string; km: number; fare: number; ride: string; date: string; rating: number };
type Driver = { name: string; car: string; plate: string; rating: number; trips: number };

const RIDES: Ride[] = [
    { id: 'eco', name: 'اقتصادي', sub: 'الأوفر، لحد ٤ ركاب', seats: 4, base: 3, km: 1.2, min: 6, mult: 1 },
    { id: 'comfort', name: 'مريح', sub: 'سيارة أحدث وتكييف', seats: 4, base: 5, km: 1.8, min: 9, mult: 1.2 },
    { id: 'family', name: 'عائلي', sub: 'حتى ٦ ركاب', seats: 6, base: 7, km: 2.4, min: 12, mult: 1.4 },
];
const DRIVERS: Driver[] = [
    { name: 'سالم المصراتي', car: 'تويوتا كورولا ٢٠١٩', plate: '٥٢٣ ٨٤١', rating: 4.9, trips: 1284 },
    { name: 'أيمن الزاوي', car: 'هيونداي إلنترا ٢٠٢١', plate: '٧٧١ ٠٩٢', rating: 4.8, trips: 902 },
    { name: 'خالد بن غشير', car: 'كيا سيراتو ٢٠٢٢', plate: '٣١٩ ٦٦٧', rating: 4.9, trips: 2140 },
];
const CHIPS = [{ n: 'مطار معيتيقة', q: 'مطار معيتيقة طرابلس' }, { n: 'قرجي', q: 'قرجي طرابلس' }, { n: 'جامعة طرابلس', q: 'جامعة طرابلس' }, { n: 'سوق الجمعة', q: 'سوق الجمعة طرابلس' }];
const ar = (n: number | string) => String(n).replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);
const fare = (r: Ride, rt: Route) => Math.max(8, Math.round((r.base + (rt.dist / 1000) * r.km + (rt.dur / 60) * 0.25) * 2) / 2);

function Logo({ size = 40, draw = false }: { size?: number; draw?: boolean }) {
    return <svg width={size} height={size} viewBox="0 0 64 64" className={draw ? 'ys-logo is-draw' : 'ys-logo'} aria-label="يلا سفر">
        <rect width="64" height="64" rx="18" fill="#0FA99C" />
        <path className="ys-logo-y" d="M17 17l15 17 15-17M32 34v15" fill="none" stroke="#fff" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="47" cy="49" r="5" fill="#FFB020" />
    </svg>;
}

function Icon({ name, active }: { name: Tab; active: boolean }) {
    const c = active ? 'ys-ic is-on' : 'ys-ic';
    if (name === 'ride') return <svg className={c} viewBox="0 0 28 28" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><g className="ic-car"><path d="M5 17v-3l2-5h14l2 5v3zM5 17v3M23 17v3" /><circle cx="9.5" cy="17" r="1.2" fill="currentColor" /><circle cx="18.5" cy="17" r="1.2" fill="currentColor" /></g><path className="ic-road" d="M3 24h22" /></svg>;
    if (name === 'trips') return <svg className={c} viewBox="0 0 28 28" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="14" cy="14" r="10" /><path className="ic-hand" d="M14 8v6l4 2" /></svg>;
    if (name === 'wallet') return <svg className={c} viewBox="0 0 28 28" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 9h18a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2z" /><path className="ic-flap" d="M5 9l14-5 2 5" /><circle cx="19" cy="16" r="1.3" fill="currentColor" /></svg>;
    return <svg className={c} viewBox="0 0 28 28" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><g className="ic-user"><circle cx="14" cy="10" r="4.5" /><path d="M5 24c1-5 4.5-7 9-7s8 2 9 7" /></g></svg>;
}

const TABS: { id: Tab; label: string }[] = [{ id: 'ride', label: 'طلب مشوار' }, { id: 'trips', label: 'رحلاتي' }, { id: 'wallet', label: 'المحفظة' }, { id: 'me', label: 'حسابي' }];

export function App() {
    const [splash, setSplash] = useState(true);
    const [tab, setTab] = useState<Tab>('ride');
    const [phase, setPhase] = useState<Phase>('idle');
    const [pickup, setPickup] = useState<Place>({ ...TRIPOLI, name: 'وسط طرابلس (موقعي التجريبي)' });
    const [dest, setDest] = useState<Place | null>(null);
    const [route, setRoute] = useState<Route | null>(null);
    const [rideId, setRideId] = useState('eco');
    const [search, setSearch] = useState<null | 'dest' | 'pickup'>(null);
    const [pickMode, setPickMode] = useState<null | 'dest' | 'pickup'>(null);
    const [toast, setToast] = useState('');
    const [fit, setFit] = useState<{ pts: LL[]; key: string }>({ pts: [TRIPOLI], key: 'init' });
    const [locate, setLocate] = useState<LL | null>(null);
    const [driver, setDriver] = useState<(LL & { heading: number }) | null>(null);
    const [drv, setDrv] = useState<Driver>(DRIVERS[0]);
    const [prog, setProg] = useState(0);
    const [etaApproach, setEtaApproach] = useState(4);
    const [dRoute, setDRoute] = useState<LL[] | null>(null);
    const [rating, setRating] = useState(0);
    const [trips, setTrips, saved] = useLocalState<Trip[]>('ys-trips.v1', []);
    const ride = RIDES.find((r) => r.id === rideId)!;

    useEffect(() => { const t = setTimeout(() => setSplash(false), 2100); return () => clearTimeout(t); }, []);
    const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 2800); };

    const plan = useCallback(async (from: Place, to: Place) => {
        setPhase('plan'); setRoute(null);
        setFit({ pts: [from, to], key: `${from.lat},${to.lat},${Math.random()}` });
        const r = await fetchRoute(from, to);
        setRoute(r);
        setFit({ pts: r.pts, key: `r${Math.random()}` });
    }, []);

    const choose = (p: Place, target: 'dest' | 'pickup') => {
        setSearch(null); setPickMode(null);
        if (target === 'dest') { setDest(p); plan(pickup, p); }
        else { setPickup(p); if (dest) plan(p, dest); else setFit({ pts: [p], key: `p${Math.random()}` }); }
    };

    const onTap = async (p: LL) => {
        if (!pickMode) return;
        const target = pickMode; setPickMode(null);
        const name = await reverse(p);
        choose({ ...p, name }, target);
    };

    const myLocation = () => {
        if (!navigator.geolocation) { say('الموقع غير متاح في هذا المتصفح'); return; }
        navigator.geolocation.getCurrentPosition(async (pos) => {
            const p = { lat: pos.coords.latitude, lon: pos.coords.longitude };
            const name = await reverse(p);
            setLocate(p); choose({ ...p, name }, 'pickup');
        }, () => say('ما قدرتش أوصل لموقعك، اختر نقطة الركوب بنفسك'), { timeout: 8000 });
    };

    // ride simulation
    const startRequest = () => { setRating(0); setPhase('searching'); };
    useEffect(() => {
        if (phase !== 'searching' || !route) return;
        const t = setTimeout(async () => {
            const d = DRIVERS[Math.floor(Math.random() * DRIVERS.length)];
            setDrv(d);
            const start = offset(pickup, 900 + Math.random() * 700, Math.random() * 360);
            const r = await fetchRoute(start, pickup);
            setDRoute(r.pts); setEtaApproach(Math.max(2, Math.round(r.dur / 60)));
            setProg(0); setDriver({ ...along(r.pts, 0) }); setPhase('enroute');
            setFit({ pts: [start, pickup], key: `a${Math.random()}` });
        }, 3600);
        return () => clearTimeout(t);
    }, [phase, route, pickup]);
    useEffect(() => {
        if (phase !== 'enroute' && phase !== 'ontrip') return;
        const pts = phase === 'enroute' ? dRoute : route?.pts;
        if (!pts) return;
        const total = phase === 'enroute' ? 15000 : 28000;
        const t0 = Date.now();
        const iv = setInterval(() => {
            const f = Math.min((Date.now() - t0) / total, 1);
            setProg(f); setDriver(along(pts, f));
            if (f >= 1) { clearInterval(iv); setPhase(phase === 'enroute' ? 'arrived' : 'done'); }
        }, 120);
        return () => clearInterval(iv);
    }, [phase, dRoute, route]);
    useEffect(() => {
        if (phase !== 'arrived' || !route) return;
        const t = setTimeout(() => { setProg(0); setPhase('ontrip'); setFit({ pts: route.pts, key: `t${Math.random()}` }); }, 3200);
        return () => clearTimeout(t);
    }, [phase, route]);

    const reset = () => { setPhase('idle'); setDest(null); setRoute(null); setDriver(null); setDRoute(null); setProg(0); setFit({ pts: [pickup], key: `z${Math.random()}` }); };
    const finish = () => {
        if (route && dest && saved.ready) {
            const t: Trip = { id: Date.now(), from: pickup.name, to: dest.name, km: Math.round(route.dist / 100) / 10, fare: fare(ride, route), ride: ride.name, date: new Date().toLocaleDateString('ar-LY'), rating };
            setTrips([t, ...trips].slice(0, 30));
        }
        reset(); say('انتهت الرحلة التجريبية وتم حفظها في رحلاتي');
    };
    const price = route ? fare(ride, route) : 0;
    const tripEta = route ? Math.max(1, Math.round((route.dur / 60) * (1 - prog))) : 0;
    const eta = phase === 'enroute' ? Math.max(1, Math.round(etaApproach * (1 - prog))) : tripEta;

    return <div className="ys-stage" dir="rtl">
        <aside className="ys-side"><Logo size={64} /><h1>يلا سفر</h1><p>مشاويرك في طرابلس، بشكل أبسط وأسرع.</p><ul><li>خريطة حقيقية وطريق فعلي</li><li>سائق وسعر تجريبيان في هذه النسخة</li><li>جاهز للربط بسائقين ودفع حقيقي لاحقًا</li></ul></aside>
        <div className="ys-app">
            {splash && <div className="ys-splash"><Logo size={96} draw /><b>يلا سفر</b><span>مشوارك يبدأ من هنا</span></div>}
            <div className="ys-demo">نسخة تجريبية · السائقون والأسعار محاكاة</div>
            <section className={tab === 'ride' ? 'ys-page ys-ridepage' : 'ys-page ys-ridepage is-hidden'}>
                <MapView pickup={pickup} dest={dest} driver={driver} route={phase === 'enroute' ? dRoute : route?.pts} fit={fit.pts} fitKey={fit.key}
                    padBottom={phase === 'idle' ? 200 : phase === 'plan' ? 500 : 440} onTap={onTap} crosshair={!!pickMode} locate={locate} />
                {pickMode && <div className="ys-banner">اضغط على الخريطة لتحديد {pickMode === 'dest' ? 'الوجهة' : 'نقطة الركوب'}<button type="button" onClick={() => setPickMode(null)}>إلغاء</button></div>}
                {phase === 'idle' && !pickMode && <div className="ys-sheet" key="idle">
                    <div className="ys-grab" />
                    <h2>أهلًا بيك</h2>
                    <button type="button" className="ys-where" onClick={() => setSearch('dest')}><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></svg>رايح فين؟</button>
                    <div className="ys-chips">{CHIPS.map((c) => <button type="button" key={c.n} onClick={async () => { try { const r = await searchPlaces(c.q); if (r[0]) choose({ ...r[0], name: c.n }, 'dest'); else say('ما لقيتش المكان'); } catch { say('تعذّر البحث، جرّب تاني'); } }}>{c.n}</button>)}</div>
                    <button type="button" className="ys-from" onClick={() => setSearch('pickup')}><i />من: {pickup.name}<em>تغيير</em></button>
                </div>}
                {phase === 'plan' && <div className="ys-sheet" key="plan">
                    <div className="ys-grab" />
                    <div className="ys-addr"><button type="button" onClick={() => setSearch('pickup')}><i className="a" />{pickup.name}</button><button type="button" onClick={() => setSearch('dest')}><i className="b" />{dest?.name}</button></div>
                    {route ? <div className="ys-meta">{ar((route.dist / 1000).toFixed(1))} كم · نحو {ar(Math.max(1, Math.round(route.dur / 60)))} دقيقة{!route.real && ' (تقدير تقريبي)'}</div> : <div className="ys-meta ys-loading">بحسب أفضل طريق…</div>}
                    <div className="ys-rides">{RIDES.map((r) => <button type="button" key={r.id} className={r.id === rideId ? 'is-on' : ''} onClick={() => setRideId(r.id)}>
                        <span className="ys-rcar"><svg viewBox="0 0 48 24" width="48" height="24"><path d="M4 17v-4l5-6h24l7 6h4v4z" fill={r.id === 'family' ? '#FFB020' : r.id === 'comfort' ? '#0A7C8C' : '#12C2A5'} /><circle cx="13" cy="18" r="3.2" fill="#0E1B2C" /><circle cx="35" cy="18" r="3.2" fill="#0E1B2C" /></svg></span>
                        <span><b>{r.name}</b><small>{r.sub}</small></span><strong>{route ? `${ar(fare(r, route))} د.ل` : '…'}</strong></button>)}</div>
                    <div className="ys-note">السعر تقدير تجريبي، الدفع نقدًا للسائق</div>
                    <div className="ys-row"><button type="button" className="ys-ghost" onClick={reset}>إلغاء</button><button type="button" className="ys-cta" disabled={!route} onClick={startRequest}>اطلب {ride.name} · {ar(price)} د.ل</button></div>
                </div>}
                {phase === 'searching' && <div className="ys-sheet ys-center" key="s">
                    <div className="ys-radar"><span /><span /><span /><Logo size={44} /></div>
                    <h2>بندوّر لك على أقرب سائق</h2><p className="ys-sub">نبحث بين السائقين التجريبيين القريبين</p>
                    <button type="button" className="ys-ghost" onClick={() => setPhase('plan')}>إلغاء الطلب</button>
                </div>}
                {(phase === 'enroute' || phase === 'arrived' || phase === 'ontrip') && <div className="ys-sheet" key="e">
                    <div className="ys-grab" />
                    <div className="ys-status"><b>{phase === 'enroute' ? `السائق وصل بعد ${ar(eta)} د` : phase === 'arrived' ? 'السائق وصل عندك' : `في الطريق، باقي ${ar(eta)} د`}</b>
                        <div className="ys-bar"><i style={{ width: `${(phase === 'arrived' ? 1 : prog) * 100}%` }} /></div></div>
                    <div className="ys-driver"><div className="ys-av">{drv.name[0]}</div><div><b>{drv.name}</b><small>{drv.car} · لوحة {drv.plate}</small><small>★ {ar(drv.rating)} · {ar(drv.trips)} رحلة <em>(سائق تجريبي)</em></small></div></div>
                    <div className="ys-addr"><button type="button" disabled><i className="a" />{pickup.name}</button><button type="button" disabled><i className="b" />{dest?.name}</button></div>
                    {phase !== 'ontrip' && <button type="button" className="ys-ghost" onClick={() => { reset(); say('تم إلغاء الطلب'); }}>إلغاء الرحلة</button>}
                </div>}
                {phase === 'done' && <div className="ys-sheet ys-center" key="d">
                    <div className="ys-check"><svg viewBox="0 0 52 52" width="64" height="64"><circle cx="26" cy="26" r="24" fill="none" stroke="#12C2A5" strokeWidth="3" /><path d="M15 27l8 8 15-17" fill="none" stroke="#12C2A5" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" /></svg></div>
                    <h2>وصلت بالسلامة</h2><p className="ys-sub">الأجرة التجريبية {ar(price)} د.ل · نقدًا</p>
                    <div className="ys-stars">{[1, 2, 3, 4, 5].map((s) => <button type="button" key={s} className={s <= rating ? 'on' : ''} onClick={() => setRating(s)} aria-label={`${s} نجوم`}>★</button>)}</div>
                    <button type="button" className="ys-cta" onClick={finish}>تم</button>
                </div>}
            </section>
            {tab === 'trips' && <section className="ys-page ys-tabpage" key="t"><h2>رحلاتي</h2>
                {trips.length === 0 ? <div className="ys-empty"><Icon name="trips" active />لسه ما فيش رحلات. جرّب طلب مشوار تجريبي.</div> :
                    trips.map((t) => <div className="ys-trip" key={t.id}><div><b>{t.to}</b><small>من {t.from}</small><small>{t.date} · {ar(t.km)} كم · {t.ride}{t.rating ? ` · ${'★'.repeat(t.rating)}` : ''}</small></div><strong>{ar(t.fare)} د.ل</strong></div>)}
                <small className="ys-hint">{saved.message}</small></section>}
            {tab === 'wallet' && <section className="ys-page ys-tabpage" key="w"><h2>المحفظة</h2>
                <div className="ys-card"><small>الرصيد</small><b>٠٫٠٠ د.ل</b><span>الدفع الإلكتروني غير مفعّل في النسخة التجريبية</span></div>
                <div className="ys-list"><div><span>●</span><b>نقدًا للسائق</b><em>مفعّل</em></div><div className="off"><span>○</span><b>بطاقة مصرفية</b><em>قريبًا</em></div><div className="off"><span>○</span><b>محفظة إلكترونية</b><em>قريبًا</em></div></div></section>}
            {tab === 'me' && <section className="ys-page ys-tabpage" key="m"><h2>حسابي</h2>
                <div className="ys-profile"><Logo size={56} /><div><b>ضيف يلا سفر</b><small>تسجيل الدخول برقم الهاتف في المرحلة القادمة</small></div></div>
                <div className="ys-list"><div><span>●</span><b>شغّال فعلًا</b><em>خريطة، بحث، طريق، حالات الرحلة</em></div><div className="off"><span>◐</span><b>محاكاة</b><em>السائق والسعر</em></div><div className="off"><span>○</span><b>تحتاج ربط</b><em>سائقون حقيقيون، دفع، حسابات</em></div></div><small className="ys-hint">© 2026 Abod Ahmed. جميع الحقوق محفوظة.</small></section>}
            <nav className="ys-nav" dir="ltr" style={{ ['--i' as any]: TABS.findIndex((t) => t.id === tab) }}>
                <span className="ys-ind" />
                {TABS.slice().reverse().map((t) => <button type="button" key={t.id} className={t.id === tab ? 'on' : ''} onClick={() => setTab(t.id)}><Icon name={t.id} active={t.id === tab} /><span>{t.label}</span></button>)}
            </nav>
            {search && <SearchSheet target={search} onClose={() => setSearch(null)} onPick={(p) => choose(p, search)} onMap={() => { setPickMode(search); setSearch(null); }} onMe={myLocation} say={say} />}
            {toast && <div className="ys-toast" role="status">{toast}</div>}
        </div>
    </div>;
}

function SearchSheet({ target, onClose, onPick, onMap, onMe, say }: { target: 'dest' | 'pickup'; onClose: () => void; onPick: (p: Place) => void; onMap: () => void; onMe: () => void; say: (m: string) => void }) {
    const [q, setQ] = useState('');
    const [res, setRes] = useState<Place[]>([]);
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(false);
    const go = () => {
        const t = q.trim();
        if (t.length < 2) return;
        setBusy(true); setDone(true);
        searchPlaces(t).then((r) => { setRes(r); setBusy(false); }).catch(() => { setBusy(false); say('تعذّر البحث الآن'); });
    };
    return <div className="ys-search">
        <div className="ys-shead"><button type="button" onClick={onClose} aria-label="رجوع">→</button><input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setDone(false); }} onKeyDown={(e) => { if (e.key === 'Enter') go(); }} placeholder={target === 'dest' ? 'ابحث عن وجهتك' : 'ابحث عن نقطة الركوب'} /><button type="button" className="ys-go" onClick={go}>بحث</button></div>
        <div className="ys-opts"><button type="button" onClick={onMap}>تحديد على الخريطة</button>{target === 'pickup' && <button type="button" onClick={onMe}>موقعي الحالي</button>}</div>
        {busy && <div className="ys-meta ys-loading">جاري البحث…</div>}
        {res.map((r, i) => <button type="button" className="ys-res" key={i} onClick={() => onPick(r)}><i />{r.name}</button>)}
        {!busy && done && res.length === 0 && <div className="ys-meta">ما لقيناش نتائج، جرّب اسم تاني أو حدّد على الخريطة</div>}
    </div>;
}
