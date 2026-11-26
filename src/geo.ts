export type LL = { lat: number; lon: number };
export type Place = LL & { name: string };
export type Route = { pts: LL[]; dist: number; dur: number; real: boolean };

export const TRIPOLI: LL = { lat: 32.8967, lon: 13.1795 };
const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;
export function haversine(a: LL, b: LL) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}
export function bearing(a: LL, b: LL) {
    const y = Math.sin(rad(b.lon - a.lon)) * Math.cos(rad(b.lat));
    const x = Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) - Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lon - a.lon));
    return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
export function offset(a: LL, meters: number, deg: number): LL {
    const d = meters / R, br = rad(deg), la = rad(a.lat), lo = rad(a.lon);
    const la2 = Math.asin(Math.sin(la) * Math.cos(d) + Math.cos(la) * Math.sin(d) * Math.cos(br));
    const lo2 = lo + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la), Math.cos(d) - Math.sin(la) * Math.sin(la2));
    return { lat: (la2 * 180) / Math.PI, lon: (lo2 * 180) / Math.PI };
}
export function along(pts: LL[], t: number): LL & { heading: number } {
    if (pts.length < 2) return { ...pts[0], heading: 0 };
    const seg: number[] = [];
    let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = haversine(pts[i - 1], pts[i]); seg.push(d); total += d; }
    let target = Math.min(Math.max(t, 0), 1) * total;
    for (let i = 0; i < seg.length; i++) {
        if (target <= seg[i] || i === seg.length - 1) {
            const f = seg[i] === 0 ? 0 : Math.min(target / seg[i], 1);
            const a = pts[i], b = pts[i + 1];
            return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f, heading: bearing(a, b) };
        }
        target -= seg[i];
    }
    return { ...pts[pts.length - 1], heading: 0 };
}
export function worldPx(p: LL, z: number) {
    const s = 256 * 2 ** z;
    const sin = Math.sin(rad(p.lat));
    return { x: ((p.lon + 180) / 360) * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}
export function fromPx(x: number, y: number, z: number): LL {
    const s = 256 * 2 ** z;
    const lon = (x / s) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * y) / s;
    return { lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))), lon };
}

export async function fetchRoute(a: LL, b: LL): Promise<Route> {
    try {
        const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=full&geometries=geojson`);
        const j = await r.json();
        const rt = j.routes?.[0];
        if (!rt) throw new Error('no route');
        return { pts: rt.geometry.coordinates.map((c: number[]) => ({ lat: c[1], lon: c[0] })), dist: rt.distance, dur: rt.duration, real: true };
    } catch {
        const d = haversine(a, b) * 1.3;
        return { pts: [a, b], dist: d, dur: d / 8, real: false };
    }
}
export async function searchPlaces(q: string): Promise<Place[]> {
    const vb = '12.6,33.2,13.7,32.5';
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&accept-language=ar&countrycodes=ly&viewbox=${vb}&q=${encodeURIComponent(q)}`);
    const j = await r.json();
    return j.map((x: any) => ({ lat: parseFloat(x.lat), lon: parseFloat(x.lon), name: String(x.display_name).split(',').slice(0, 3).join('،') }));
}
export async function reverse(p: LL): Promise<string> {
    try {
        const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=ar&lat=${p.lat}&lon=${p.lon}`);
        const j = await r.json();
        return String(j.display_name || '').split(',').slice(0, 2).join('،') || 'موقع محدد على الخريطة';
    } catch { return 'موقع محدد على الخريطة'; }
}
