import { useEffect, useState } from 'react';
export function useLocalState<T>(k: string, init: T): [T, (v: T) => void, { ready: boolean; message: string }] {
    const [v, s] = useState<T>(() => { try { const r = localStorage.getItem(k); return r ? JSON.parse(r) : init; } catch { return init; } });
    useEffect(() => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }, [k, v]);
    return [v, s, { ready: true, message: '' }];
}
