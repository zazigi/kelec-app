export function formatMeasure(value: number | null, digits: number): string {
    if (value === null || !Number.isFinite(value)) return '—';
    const fixed = value.toFixed(digits);
    return fixed.replace('.', ',');
}

export function formatSigned(value: number, digits: number): string {
    const sign = value > 0 ? '+' : '';
    return sign + formatMeasure(value, digits);
}

export function formatAgePl(ageMs: number | null): string {
    if (ageMs === null || !Number.isFinite(ageMs)) return 'czas nieznany';
    if (ageMs < 0) return 'czas z przyszłości';
    const minutes = Math.floor(ageMs / 60000);
    if (minutes < 1) return 'mniej niż minuta';
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatInputNumber(value: number | null): string {
    if (value === null || !Number.isFinite(value)) return '';
    return String(value).replace('.', ',');
}
