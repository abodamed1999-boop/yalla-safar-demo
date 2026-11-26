import React, { useEffect, useRef, useState } from 'react';
import { LL, fromPx, worldPx } from './geo';

const cache = new Map<string, Promise<string>>();
function loadTile(z: number, x: number, y: number) {
    const k = `${z}/${x}/${y}`;
    let p = cache.get(k);
    if (!p) {
        p = fetch(`https://tile.openstreetmap.org/${k}.png`).then((r) => { if (!r.ok) throw new Error('tile'); return r.blob(); }).then((b) => URL.createObjectURL(b));
        p.catch(() => cache.delete(k));
        cache.set(k, p);
    }
    return p;
}
function Tile({ z, x, y, left, top }: { z: number; x: number; y: number; left: number; top: number }) {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
        let live = true;
        const n = 2 ** z;
        loadTile(z, ((x % n) + n) % n, y).then((s) => live && setSrc(s)).catch(() => {});
        return () => { live = false; };
    }, [z, x, y]);
    return <div className="ys-tile" style={{ left, top }}>{src && <img src={src} alt="" draggable={false} />}</div>;
}

type Props = {
    pickup?: LL | null; dest?: LL | null; driver?: (LL & { heading: number }) | null; route?: LL[] | null; routeKey?: string;
    fit?: LL[] | null; fitKey?: string; padBottom?: number; onTap?: (p: LL) => void; crosshair?: boolean; locate?: LL | null;
};

export function MapView({ pickup, dest, driver, route, fit, fitKey, padBottom = 0, onTap, crosshair, locate }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [size, setSize] = useState({ w: 390, h: 700 });
    const [view, setView] = useState({ lat: 32.8967, lon: 13.1795, z: 13 });
    const drag = useRef<{ x: number; y: number; cx: number; cy: number; moved: boolean } | null>(null);
    const viewRef = useRef(view); viewRef.current = view;
    const sizeRef = useRef(size); sizeRef.current = size;

    useEffect(() => {
        const el = ref.current; if (!el) return;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el); setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        if (!fit || fit.length === 0) return;
        const { w, h } = sizeRef.current;
        const availH = Math.max(h - padBottom - 70, 100);
        let z = 17;
        for (; z > 3; z--) {
            const ps = fit.map((p) => worldPx(p, z));
            const xs = ps.map((p) => p.x), ys = ps.map((p) => p.y);
            if (Math.max(...xs) - Math.min(...xs) < w - 90 && Math.max(...ys) - Math.min(...ys) < availH) break;
        }
        const ps = fit.map((p) => worldPx(p, z));
        const mx = (Math.min(...ps.map((p) => p.x)) + Math.max(...ps.map((p) => p.x))) / 2;
        const my = (Math.min(...ps.map((p) => p.y)) + Math.max(...ps.map((p) => p.y))) / 2;
        const c = fromPx(mx, my + padBottom / 2 - 20, z);
        setView({ lat: c.lat, lon: c.lon, z });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fitKey]);

    useEffect(() => { if (locate) setView((v) => ({ ...v, lat: locate.lat, lon: locate.lon, z: Math.max(v.z, 15) })); }, [locate]);

    const { w, h } = size;
    const c = worldPx(view, view.z);
    const x0 = c.x - w / 2, y0 = c.y - h / 2;
    const proj = (p: LL) => { const q = worldPx(p, view.z); return { x: q.x - x0, y: q.y - y0 }; };
    const n = 2 ** view.z;
    const tiles: React.ReactNode[] = [];
    for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + h) / 256); ty++) {
        if (ty < 0 || ty >= n) continue;
        for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + w) / 256); tx++) {
            tiles.push(<Tile key={`${view.z}/${tx}/${ty}`} z={view.z} x={tx} y={ty} left={tx * 256 - x0} top={ty * 256 - y0} />);
        }
    }
    const zoom = (d: number) => setView((v) => ({ ...v, z: Math.min(18, Math.max(3, v.z + d)) }));
    const down = (e: React.PointerEvent) => {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
        const cc = worldPx(viewRef.current, viewRef.current.z);
        drag.current = { x: e.clientX, y: e.clientY, cx: cc.x, cy: cc.y, moved: false };
    };
    const move = (e: React.PointerEvent) => {
        const d = drag.current; if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (Math.abs(dx) + Math.abs(dy) > 6) d.moved = true;
        if (d.moved) { const p = fromPx(d.cx - dx, d.cy - dy, viewRef.current.z); setView((v) => ({ ...v, lat: p.lat, lon: p.lon })); }
    };
    const up = (e: React.PointerEvent) => {
        const d = drag.current; drag.current = null;
        if (d && !d.moved && onTap) {
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const cc = worldPx(viewRef.current, viewRef.current.z);
            onTap(fromPx(cc.x + (e.clientX - rect.left - rect.width / 2), cc.y + (e.clientY - rect.top - rect.height / 2), viewRef.current.z));
        }
    };
    const path = route && route.length > 1 ? route.map((p, i) => { const q = proj(p); return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}`; }).join('') : '';
    const pk = pickup ? proj(pickup) : null, ds = dest ? proj(dest) : null, dr = driver ? proj(driver) : null;
    return <div className="ys-map" dir="ltr" ref={ref} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { drag.current = null; }}
        onWheel={(e) => zoom(e.deltaY < 0 ? 1 : -1)}>
        <div className="ys-tiles">{tiles}</div>
        <svg className="ys-overlay" width={w} height={h}>
            {path && <><path d={path} className="ys-route-casing" /><path d={path} className="ys-route" /></>}
        </svg>
        {pk && <div className="ys-pin ys-pin-a" style={{ left: pk.x, top: pk.y }}><span className="ys-pulse" /><i /></div>}
        {ds && <div className="ys-pin ys-pin-b" style={{ left: ds.x, top: ds.y }}><svg viewBox="0 0 24 32" width="30" height="40"><path d="M12 1C6 1 1.5 5.6 1.5 11.4 1.5 19 12 31 12 31s10.5-12 10.5-19.6C22.5 5.6 18 1 12 1z" fill="#0E1B2C" /><circle cx="12" cy="11.5" r="4" fill="#FFB020" /></svg></div>}
        {dr && <div className="ys-car" style={{ left: dr.x, top: dr.y }}><div style={{ transform: `rotate(${driver!.heading}deg)` }}>
            <svg viewBox="0 0 24 40" width="26" height="44"><rect x="3" y="2" width="18" height="36" rx="8" fill="#12C2A5" stroke="#0E1B2C" strokeWidth="2" /><rect x="6" y="9" width="12" height="9" rx="3" fill="#0E1B2C" /><rect x="6" y="26" width="12" height="6" rx="2" fill="#0E1B2C" opacity=".6" /></svg></div></div>}
        {crosshair && <div className="ys-cross" />}
        <div className="ys-zoom"><button type="button" aria-label="تكبير" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(1)}>+</button><button type="button" aria-label="تصغير" onPointerDown={(e) => e.stopPropagation()} onClick={() => zoom(-1)}>−</button></div>
        <div className="ys-attr">© OpenStreetMap contributors</div>
    </div>;
}
