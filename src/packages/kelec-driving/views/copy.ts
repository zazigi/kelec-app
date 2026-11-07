import { DrivingAssessment, TrendStatus } from "../services/drivingEstimate";

export const COPY = {
    title: 'Jazda',
    open: 'Tablica jazdy',
    glanceWarning: 'Do rzutu oka. Zatrzymaj się, zanim coś wpiszesz.',
    demo: 'Dane demonstracyjne. To nie jest Renault 5 i odświeżenie nie zmienia liczb, tylko czas.',
    unsupported: 'Ten ekran liczy odczyty chmury Renault (battery-status i cockpit). Dla tego auta tych pól tu nie ma. Prędkość z lokalizacji nie jest pokazywana jako prędkość auta.',
    refresh: 'Odśwież odczyt chmury',
    refreshing: 'Pobieranie…',
    refreshFailed: 'Nie udało się pobrać odczytu. Hasło nie jest zapisywane na tym ekranie.',
    arrival: 'Bateria na mecie',
    arrivalEnergy: 'Energia na mecie',
    remaining: 'Zostało trasy',
    noArrival: 'Brak prognozy',
    unreachable: 'Nie dojedziesz',
    deficit: 'Brakuje',
    parameters: 'Ostatni odczyt',
    missingTitle: 'Czego ten odczyt nie daje',
    formTitle: 'Wpisz, gdy stoisz',
    routeLabel: 'Dystans trasy (km drogą, nie linia prosta)',
    routePlaceholder: 'np. 42',
    saveRoute: 'Ustaw dystans od teraz',
    clearRoute: 'Wyczyść dystans',
    capacityLabel: 'Pojemność użyteczna (kWh)',
    capacityPlaceholder: 'puste = chmura, jeśli poda',
    manualLabel: 'Zużycie ręczne (kWh/100 km)',
    manualPlaceholder: 'tylko gdy brak pomiaru z odczytów',
    saveEstimates: 'Zapisz pojemność i szacunek',
    clearSamples: 'Wyczyść zapisane odczyty',
    badNumber: 'Nie rozumiem tej liczby. Użyj cyfr, przecinka albo kropki.',
    saved: 'Zapisane na tym telefonie.',
    samples: 'Zapisane odczyty',
    notRealtime: 'Zużycie z przerw między odczytami chmury. To nie jest pomiar na żywo.',
    noSpeed: 'Prędkość auta: niedostępna.',
    positionUnavailable: 'Pozycja: niedostępna.',
    positionNotSpeed: 'Pozycja z chmury. To nie jest prędkość auta.',
} as const;

const TREND_TITLE: Record<TrendStatus, string> = {
    improving: 'Lepiej',
    worsening: 'Gorzej',
    stable: 'Bez zmian',
    stationary: 'Postój',
    warmup: 'Za mało odcinków',
    insufficient: 'Brak pomiaru',
    stale: 'Odczyt nieaktualny',
    out_of_order: 'Zła kolejność',
};

const TREND_DETAIL: Record<TrendStatus, string> = {
    improving: 'Ostatni odcinek między odczytami zużywa mniej niż wcześniejsze. Rezerwa na mecie przy tym tempie rośnie względem tamtego stylu.',
    worsening: 'Ostatni odcinek zużywa więcej niż wcześniejsze odczyty. Rezerwa na mecie przy tym tempie maleje.',
    stable: 'Ostatni odcinek jest w pasmie 5% wobec wcześniejszej średniej.',
    stationary: 'Licznik nie przybył. Auto stoi albo chmura jeszcze nie podniosła licznika.',
    warmup: 'Jest jeden odcinek ze spadkiem energii i przyrostem licznika. Do trendu potrzeba dwóch.',
    insufficient: 'Za mało zgodnych odczytów, żeby ocenić styl jazdy.',
    stale: 'Czas baterii ma ponad 20 minut albo go nie ma. Trend jazdy jest wstrzymany. Odśwież ręcznie — aplikacja nie odpytuje chmury w tle.',
    out_of_order: 'Nowszy odczyt ma wcześniejszy czas niż poprzedni. Nie układam z tego trasy.',
};

export function trendTitle(status: TrendStatus): string {
    return TREND_TITLE[status];
}

export function trendDetail(status: TrendStatus): string {
    return TREND_DETAIL[status];
}

const REASON_TEXT: Record<string, string> = {
    demo_data: COPY.demo,
    unsupported_source: COPY.unsupported,
    invalid_capacity: 'Pojemność jest pusta, równa zero, ujemna albo większa niż 300 kWh. Procent na mecie jest wyłączony. Aplikacja nie zgaduje wersji baterii.',
    energy_estimated_from_capacity: 'Energia to stan naładowania razy wpisana pojemność, nie pole batteryAvailableEnergy.',
    charging: 'Ładowanie według ostatniego odczytu. Takie odcinki nie wchodzą do zużycia jazdy.',
    invalid_route: 'Dystans trasy jest nieprawidłowy.',
    route_reduced_by_odometer: 'Zostało = wpisane kilometry trasy minus przyrost licznika od zapisu. To nie jest nawigacja.',
    route_unadjusted: 'Zostało tyle, ile wpisano. Licznik nie był znany przy zapisie, więc liczba sama się nie zmniejsza.',
    inconsistent_odometer: 'Licznik jest mniejszy niż przy zapisie dystansu. Zostawiam wpisaną liczbę.',
    battery_time_unknown: 'Odczyt baterii nie ma czasu. Nie da się ocenić, czy jest świeży.',
    battery_time_in_future: 'Czas baterii jest w przyszłości względem telefonu.',
    stale_snapshot: 'Odczyt baterii jest starszy niż 20 minut.',
    out_of_order: TREND_DETAIL.out_of_order,
    stale_duplicate: 'Powtórzony odczyt o tym samym czasie baterii.',
    battery_snapshot_unchanged: 'Licznik się zmienił, a czas baterii nie. Zużycie tego kawałka jest nieznane.',
    too_sparse: 'Odczyty dzieli ponad 3 godziny. Taki odcinek nie opisuje stylu jazdy.',
    odometer_unavailable: 'Brak licznika (cockpit). Bez niego nie ma zużycia na kilometr.',
    odometer_decreased: 'Licznik cofnął się. Ten odcinek jest odrzucony.',
    zero_distance: 'Przebyty dystans tego odcinka to zero.',
    distance_too_small: 'Przyrost licznika jest mniejszy niż 2 km. Za mało, żeby liczyć zużycie.',
    energy_unavailable: 'Brak energii w kWh. Wpisz pojemność użyteczną albo poczekaj na batteryAvailableEnergy.',
    energy_increased: 'Energia wzrosła bez oznaczenia ładowania. Odcinek nie jest jazdą.',
    energy_source_changed: 'Źródło energii zmieniło się między odczytami. Nie porównuję tych liczb.',
    implausible_consumption: 'Wyliczone zużycie przekracza 150 kWh/100 km. Odcinek odrzucony jako niewiarygodny.',
    insufficient_intervals: 'Potrzeba co najmniej dwóch ważnych odcinków, żeby powiedzieć lepiej albo gorzej.',
    warmup: TREND_DETAIL.warmup,
    not_realtime: COPY.notRealtime,
    manual_estimate: 'Prognoza używa wpisanego zużycia. To szacunek, nie pomiar stylu jazdy.',
    invalid_manual_consumption: 'Wpisane zużycie jest nieprawidłowe i nie jest używane.',
    zero_route_distance: 'Dystans trasy to 0 km według wpisu i licznika. Na mecie jest to, co jest teraz.',
    unreachable: 'Przy tym zużyciu energii nie starczy na wpisany dystans.',
};

export function reasonLines(assessment: DrivingAssessment): string[] {
    return assessment.reasons.map(reason => REASON_TEXT[reason]).filter((line): line is string => line !== undefined);
}

export const MISSING_MEASUREMENTS = [
    'Moc chwilowa w jeździe (kW) — brak w battery-status.',
    'Prędkość auta — brak. Prędkość z GPS nie jest pokazywana w jej miejsce.',
    'Zużycie z komputera pokładowego — brak.',
    'Pozostała trasa z nawigacji — brak. Dystans jest tylko ręczny, potem korygowany licznikiem.',
    'Czas pomiaru licznika — cockpit go nie ma. Widać tylko czas pobrania przez aplikację.',
    'Strumień danych — tylko wolny odczyt po ręcznym odświeżeniu, bez odpytywania w tle.',
];

export function routeSourceLabel(source: DrivingAssessment['routeSource']): string {
    switch (source) {
        case 'manual_reduced_by_odometer':
            return 'ręczna trasa minus licznik';
        case 'manual_unadjusted':
            return 'ręczna trasa, bez korekty licznika';
        case 'inconsistent_odometer':
            return 'ręczna trasa, licznik niespójny';
        case 'invalid':
            return 'nieprawidłowy dystans';
        default:
            return 'brak dystansu trasy';
    }
}
