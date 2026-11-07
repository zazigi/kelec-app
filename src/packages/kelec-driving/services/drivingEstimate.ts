/**
 * Prognoza jazdy liczona wyłącznie z odczytów, które aplikacja już dostaje
 * (battery-status + cockpit) albo z liczb wpisanych przez użytkownika.
 *
 * To nie jest telemetria na żywo: chmura Renault nie podaje mocy chwilowej,
 * prędkości auta ani trasy nawigacji. Moduł nie przyjmuje współrzędnych GPS
 * i nie zamienia ich w dystans ani w prędkość.
 */

export const DRIVING_LIMITS = {
    /** Powyżej tego wieku czas baterii z chmury nie służy do oceny stylu jazdy. */
    staleMs: 20 * 60 * 1000,
    /** Odcinek dłuższy miesza postój, jazdę i ewentualne ładowanie. */
    maxIntervalMs: 3 * 60 * 60 * 1000,
    /**
     * Poniżej 2 km nie ufać delcie licznika: rozdzielczość cockpit bywa gruba,
     * a to nie jest założenie o aucie, tylko próg szumu.
     */
    minDistanceKm: 2,
    /** Poniżej tego przyrostu licznik traktujemy jak brak ruchu (szum). */
    zeroDistanceKm: 0.05,
    /** Pasmo względne: zużycie w tym pasmie = styl bez zmiany. */
    trendBand: 0.05,
    /** Powyżej: odrzucenie odcinka jako niewiarygodnego, nie specyfikacja auta. */
    maxKwhPerKm: 1.5,
    /** Odrzucenie literówki. Nie jest pojemnością żadnej wersji Renault 5. */
    maxCapacityKwh: 300,
    maxRouteKm: 5000,
    maxManualKwhPer100Km: 150,
    maxSamples: 40,
} as const;

export type SnapshotOrigin = 'renault_cloud' | 'demo' | 'unsupported';

export type EnergySource = 'cloud_available_energy' | 'soc_times_capacity' | 'unavailable';

export type DrivingSample = {
    sequence: number;
    batteryObservedAtMs: number | null;
    fetchedAtMs: number;
    odometerKm: number | null;
    energyKwh: number | null;
    energySource: EnergySource;
    socPercent: number | null;
    isCharging: boolean;
};

export type CurrentSnapshot = {
    origin: SnapshotOrigin;
    batteryObservedAtMs: number | null;
    fetchedAtMs: number;
    socPercent: number | null;
    cloudAvailableEnergyKwh: number | null;
    /** Null gdy chmura pomija pojemność albo podaje wartość niedodatnią. */
    cloudCapacityKwh: number | null;
    manufacturerRangeKm: number | null;
    batteryTemperatureC: number | null;
    odometerKm: number | null;
    isCharging: boolean;
    isPlugged: boolean;
};

export type DrivingInputs = {
    /** Null = pole puste. Liczba niedodatnia = jawnie zły wpis, bez powrotu do chmury. */
    usableCapacityKwh: number | null;
    routeRemainingKm: number | null;
    odometerKmAtRouteEntry: number | null;
    manualConsumptionKwhPer100Km: number | null;
};

export const EMPTY_DRIVING_INPUTS: DrivingInputs = {
    usableCapacityKwh: null,
    routeRemainingKm: null,
    odometerKmAtRouteEntry: null,
    manualConsumptionKwhPer100Km: null,
};

export type TrendStatus =
    | 'improving'
    | 'worsening'
    | 'stable'
    | 'stationary'
    | 'warmup'
    | 'insufficient'
    | 'stale'
    | 'out_of_order';

export type RouteSource =
    | 'unset'
    | 'invalid'
    | 'manual_unadjusted'
    | 'manual_reduced_by_odometer'
    | 'inconsistent_odometer';

export type ArrivalStatus = 'ok' | 'zero_distance' | 'unreachable' | 'unavailable';

export type CapacityStatus = 'ok' | 'invalid' | 'missing';

export type ConsumptionSource = 'snapshot_intervals' | 'manual_estimate' | 'none';

export type DrivingAssessment = {
    trend: TrendStatus;
    /** Gdy nagłówek to „nieaktualne”, a starsze odcinki dałyby werdykt. Nie jest aktualnym stylem. */
    latentTrend: 'improving' | 'worsening' | 'stable' | null;
    recentConsumptionKwhPer100Km: number | null;
    referenceConsumptionKwhPer100Km: number | null;
    consumptionSource: ConsumptionSource;
    /** Dodatnie: aktualny odcinek zostawia więcej energii na mecie niż wcześniejsza średnia. */
    reserveDeltaKwh: number | null;
    arrivalKwh: number | null;
    arrivalPercent: number | null;
    arrivalStatus: ArrivalStatus;
    capacityKwh: number | null;
    capacityStatus: CapacityStatus;
    capacitySource: 'user' | 'cloud' | 'none';
    energyNowKwh: number | null;
    energySource: EnergySource;
    remainingRouteKm: number | null;
    routeSource: RouteSource;
    snapshotAgeMs: number | null;
    validIntervalCount: number;
    reasons: string[];
};

export type ParsedDecimal = { ok: true; value: number | null } | { ok: false };

type Interval =
    | { ok: true; kwhPer100: number }
    | { ok: false; reason: string };

export function emptySnapshot(origin: SnapshotOrigin, fetchedAtMs: number): CurrentSnapshot {
    return {
        origin,
        batteryObservedAtMs: null,
        fetchedAtMs,
        socPercent: null,
        cloudAvailableEnergyKwh: null,
        cloudCapacityKwh: null,
        manufacturerRangeKm: null,
        batteryTemperatureC: null,
        odometerKm: null,
        isCharging: false,
        isPlugged: false,
    };
}

export function parseUserDecimal(text: string): ParsedDecimal {
    const trimmed = text.trim().replace(/\s/g, '').replace(',', '.');
    if (trimmed === '') return { ok: true, value: null };
    const value = Number(trimmed);
    if (!Number.isFinite(value)) return { ok: false };
    return { ok: true, value };
}

export function isValidCapacity(value: number | null): boolean {
    return value !== null && Number.isFinite(value) && value > 0 && value <= DRIVING_LIMITS.maxCapacityKwh;
}

export function resolveCapacity(
    user: number | null,
    cloud: number | null,
): { kwh: number | null; status: CapacityStatus; source: 'user' | 'cloud' | 'none' } {
    if (user !== null) {
        if (!isValidCapacity(user)) return { kwh: null, status: 'invalid', source: 'none' };
        return { kwh: user, status: 'ok', source: 'user' };
    }
    if (cloud !== null) {
        if (!isValidCapacity(cloud)) return { kwh: null, status: 'invalid', source: 'none' };
        return { kwh: cloud, status: 'ok', source: 'cloud' };
    }
    return { kwh: null, status: 'missing', source: 'none' };
}

export function resolveEnergy(
    socPercent: number | null,
    cloudEnergyKwh: number | null,
    capacityKwh: number | null,
): { kwh: number | null; source: EnergySource } {
    if (cloudEnergyKwh !== null && Number.isFinite(cloudEnergyKwh) && cloudEnergyKwh >= 0) {
        return { kwh: cloudEnergyKwh, source: 'cloud_available_energy' };
    }
    if (
        socPercent !== null
        && Number.isFinite(socPercent)
        && socPercent >= 0
        && socPercent <= 100
        && capacityKwh !== null
        && isValidCapacity(capacityKwh)
    ) {
        return { kwh: (socPercent / 100) * capacityKwh, source: 'soc_times_capacity' };
    }
    return { kwh: null, source: 'unavailable' };
}

export function resolveRemainingRoute(
    routeKm: number | null,
    odometerAtEntryKm: number | null,
    currentOdometerKm: number | null,
): { km: number | null; source: RouteSource } {
    if (routeKm === null) return { km: null, source: 'unset' };
    if (!Number.isFinite(routeKm) || routeKm < 0 || routeKm > DRIVING_LIMITS.maxRouteKm) {
        return { km: null, source: 'invalid' };
    }
    const haveOdometer = odometerAtEntryKm !== null
        && currentOdometerKm !== null
        && Number.isFinite(odometerAtEntryKm)
        && Number.isFinite(currentOdometerKm);
    if (!haveOdometer) return { km: routeKm, source: 'manual_unadjusted' };

    const driven = currentOdometerKm - odometerAtEntryKm;
    if (driven < -DRIVING_LIMITS.zeroDistanceKm) {
        return { km: routeKm, source: 'inconsistent_odometer' };
    }
    return {
        km: Math.max(0, routeKm - Math.max(0, driven)),
        source: 'manual_reduced_by_odometer',
    };
}

export function isValidManualConsumption(value: number | null): boolean {
    return value !== null
        && Number.isFinite(value)
        && value > 0
        && value <= DRIVING_LIMITS.maxManualKwhPer100Km;
}

export function sampleFromCurrent(
    current: CurrentSnapshot,
    inputs: DrivingInputs,
    sequence: number,
): DrivingSample {
    const capacity = resolveCapacity(inputs.usableCapacityKwh, current.cloudCapacityKwh);
    const energy = resolveEnergy(current.socPercent, current.cloudAvailableEnergyKwh, capacity.kwh);
    return {
        sequence,
        batteryObservedAtMs: current.batteryObservedAtMs,
        fetchedAtMs: current.fetchedAtMs,
        odometerKm: current.odometerKm,
        energyKwh: energy.kwh,
        energySource: energy.source,
        socPercent: current.socPercent,
        isCharging: current.isCharging,
    };
}

export function appendSample(
    samples: readonly DrivingSample[],
    next: DrivingSample,
): { samples: DrivingSample[]; accepted: boolean; reason?: 'duplicate' } {
    const last = samples[samples.length - 1];
    if (
        last
        && last.batteryObservedAtMs === next.batteryObservedAtMs
        && last.odometerKm === next.odometerKm
        && last.energyKwh === next.energyKwh
        && last.socPercent === next.socPercent
        && last.isCharging === next.isCharging
    ) {
        return { samples: [...samples], accepted: false, reason: 'duplicate' };
    }
    return {
        samples: [...samples, next].slice(-DRIVING_LIMITS.maxSamples),
        accepted: true,
    };
}

function compareTrend(recent: number, reference: number): 'improving' | 'worsening' | 'stable' {
    if (reference === 0) {
        if (recent === 0) return 'stable';
        return recent > 0 ? 'worsening' : 'improving';
    }
    const low = reference * (1 - DRIVING_LIMITS.trendBand);
    const high = reference * (1 + DRIVING_LIMITS.trendBand);
    if (recent < low) return 'improving';
    if (recent > high) return 'worsening';
    return 'stable';
}

function pairInterval(prev: DrivingSample, next: DrivingSample): Interval {
    const tPrev = prev.batteryObservedAtMs;
    const tNext = next.batteryObservedAtMs;
    if (tPrev === null || tNext === null) return { ok: false, reason: 'battery_time_unknown' };
    if (tNext < tPrev) return { ok: false, reason: 'out_of_order' };
    if (tNext === tPrev) {
        const moved = prev.odometerKm !== null
            && next.odometerKm !== null
            && next.odometerKm - prev.odometerKm >= DRIVING_LIMITS.minDistanceKm;
        return { ok: false, reason: moved ? 'battery_snapshot_unchanged' : 'stale_duplicate' };
    }
    if (tNext - tPrev > DRIVING_LIMITS.maxIntervalMs) return { ok: false, reason: 'too_sparse' };
    if (prev.isCharging || next.isCharging) return { ok: false, reason: 'charging' };
    if (prev.energySource !== next.energySource) return { ok: false, reason: 'energy_source_changed' };
    if (prev.odometerKm === null || next.odometerKm === null) return { ok: false, reason: 'odometer_unavailable' };

    const distance = next.odometerKm - prev.odometerKm;
    if (distance < -DRIVING_LIMITS.zeroDistanceKm) return { ok: false, reason: 'odometer_decreased' };
    if (distance <= DRIVING_LIMITS.zeroDistanceKm) return { ok: false, reason: 'zero_distance' };
    if (distance < DRIVING_LIMITS.minDistanceKm) return { ok: false, reason: 'distance_too_small' };
    if (
        prev.energyKwh === null
        || next.energyKwh === null
        || prev.energySource === 'unavailable'
        || next.energySource === 'unavailable'
    ) {
        return { ok: false, reason: 'energy_unavailable' };
    }

    const used = prev.energyKwh - next.energyKwh;
    if (used < 0) return { ok: false, reason: 'energy_increased' };
    const kwhPerKm = used / distance;
    if (kwhPerKm > DRIVING_LIMITS.maxKwhPerKm) return { ok: false, reason: 'implausible_consumption' };
    return { ok: true, kwhPer100: kwhPerKm * 100 };
}

function pushReason(reasons: string[], reason: string): void {
    if (!reasons.includes(reason)) reasons.push(reason);
}

export function evaluateDriving(
    samples: readonly DrivingSample[],
    inputs: DrivingInputs,
    current: CurrentSnapshot,
    nowMs: number,
): DrivingAssessment {
    const reasons: string[] = [];
    const capacity = resolveCapacity(inputs.usableCapacityKwh, current.cloudCapacityKwh);
    const energy = resolveEnergy(current.socPercent, current.cloudAvailableEnergyKwh, capacity.kwh);
    const route = resolveRemainingRoute(
        inputs.routeRemainingKm,
        inputs.odometerKmAtRouteEntry,
        current.odometerKm,
    );

    if (current.origin === 'demo') pushReason(reasons, 'demo_data');
    if (current.origin === 'unsupported') pushReason(reasons, 'unsupported_source');
    if (capacity.status === 'invalid') pushReason(reasons, 'invalid_capacity');
    if (energy.source === 'soc_times_capacity') pushReason(reasons, 'energy_estimated_from_capacity');
    if (current.isCharging) pushReason(reasons, 'charging');
    if (route.source === 'invalid') pushReason(reasons, 'invalid_route');
    if (route.source === 'manual_reduced_by_odometer') pushReason(reasons, 'route_reduced_by_odometer');
    if (route.source === 'manual_unadjusted') pushReason(reasons, 'route_unadjusted');
    if (route.source === 'inconsistent_odometer') pushReason(reasons, 'inconsistent_odometer');

    const age = current.batteryObservedAtMs === null ? null : nowMs - current.batteryObservedAtMs;
    const stale = current.origin !== 'unsupported' && (age === null || age > DRIVING_LIMITS.staleMs || age < 0);
    if (current.origin !== 'unsupported' && age === null) pushReason(reasons, 'battery_time_unknown');
    if (age !== null && age < 0) pushReason(reasons, 'battery_time_in_future');
    if (age !== null && age > DRIVING_LIMITS.staleMs) pushReason(reasons, 'stale_snapshot');

    const valid: { kwhPer100: number }[] = [];
    let lastPair: Interval | null = null;
    for (let i = 1; i < samples.length; i++) {
        const pair = pairInterval(samples[i - 1], samples[i]);
        lastPair = pair;
        if (pair.ok) valid.push(pair);
        else if (i === samples.length - 1) pushReason(reasons, pair.reason);
    }

    let recent: number | null = valid.length > 0 ? valid[valid.length - 1].kwhPer100 : null;
    let reference: number | null = null;
    let latent: 'improving' | 'worsening' | 'stable' | null = null;
    if (valid.length >= 2 && recent !== null) {
        const previous = valid.slice(0, -1).slice(-5);
        reference = previous.reduce((sum, interval) => sum + interval.kwhPer100, 0) / previous.length;
        latent = compareTrend(recent, reference);
    }

    let trend: TrendStatus;
    if (current.origin === 'unsupported') trend = 'insufficient';
    else if (lastPair && !lastPair.ok && lastPair.reason === 'out_of_order') trend = 'out_of_order';
    else if (stale) trend = 'stale';
    else if (lastPair && !lastPair.ok && lastPair.reason === 'zero_distance') trend = 'stationary';
    else if (lastPair?.ok && valid.length >= 2) trend = latent ?? 'stable';
    else if (lastPair?.ok && valid.length === 1) trend = 'warmup';
    else trend = 'insufficient';

    if (trend === 'insufficient' && valid.length < 2) pushReason(reasons, 'insufficient_intervals');
    if (trend === 'warmup') pushReason(reasons, 'warmup');

    const measuredHeadline = trend === 'improving' || trend === 'worsening' || trend === 'stable' || trend === 'warmup';
    let consumption: number | null = null;
    let consumptionSource: ConsumptionSource = 'none';
    if (measuredHeadline && recent !== null) {
        consumption = recent;
        consumptionSource = 'snapshot_intervals';
        pushReason(reasons, 'not_realtime');
    } else if (isValidManualConsumption(inputs.manualConsumptionKwhPer100Km)) {
        consumption = inputs.manualConsumptionKwhPer100Km;
        consumptionSource = 'manual_estimate';
        pushReason(reasons, 'manual_estimate');
    } else if (inputs.manualConsumptionKwhPer100Km !== null) {
        pushReason(reasons, 'invalid_manual_consumption');
    }

    const publishedRecent = measuredHeadline ? recent : null;
    const publishedReference = trend === 'improving' || trend === 'worsening' || trend === 'stable' ? reference : null;
    const publishedLatent = trend === 'stale' ? latent : null;

    let reserveDeltaKwh: number | null = null;
    if (
        publishedRecent !== null
        && publishedReference !== null
        && energy.kwh !== null
        && route.km !== null
        && route.source !== 'invalid'
    ) {
        const predict = (kwhPer100: number) => energy.kwh! - route.km! * kwhPer100 / 100;
        reserveDeltaKwh = predict(publishedRecent) - predict(publishedReference);
    }

    let arrivalKwh: number | null = null;
    let arrivalPercent: number | null = null;
    let arrivalStatus: ArrivalStatus = 'unavailable';
    if (route.source !== 'unset' && route.source !== 'invalid' && route.km !== null) {
        if (route.km === 0) {
            if (energy.kwh !== null) {
                arrivalKwh = energy.kwh;
                arrivalStatus = 'zero_distance';
                pushReason(reasons, 'zero_route_distance');
                if (capacity.status === 'ok' && capacity.kwh !== null) {
                    arrivalPercent = (arrivalKwh / capacity.kwh) * 100;
                }
            }
        } else if (energy.kwh !== null && consumption !== null) {
            arrivalKwh = energy.kwh - (route.km * consumption) / 100;
            arrivalStatus = arrivalKwh < 0 ? 'unreachable' : 'ok';
            if (arrivalStatus === 'unreachable') pushReason(reasons, 'unreachable');
            if (capacity.status === 'ok' && capacity.kwh !== null) {
                arrivalPercent = (arrivalKwh / capacity.kwh) * 100;
            }
        }
    }

    return {
        trend,
        latentTrend: publishedLatent,
        recentConsumptionKwhPer100Km: publishedRecent,
        referenceConsumptionKwhPer100Km: publishedReference,
        consumptionSource,
        reserveDeltaKwh,
        arrivalKwh,
        arrivalPercent,
        arrivalStatus,
        capacityKwh: capacity.kwh,
        capacityStatus: capacity.status,
        capacitySource: capacity.source,
        energyNowKwh: energy.kwh,
        energySource: energy.source,
        remainingRouteKm: route.km,
        routeSource: route.source,
        snapshotAgeMs: age,
        validIntervalCount: valid.length,
        reasons,
    };
}
