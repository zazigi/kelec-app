import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    appendSample,
    CurrentSnapshot,
    DRIVING_LIMITS,
    DrivingInputs,
    DrivingSample,
    EMPTY_DRIVING_INPUTS,
    evaluateDriving,
    parseUserDecimal,
    sampleFromCurrent,
} from "../../../src/packages/kelec-driving/services/drivingEstimate";
import {
    isRenaultCharging,
    snapshotFromDemoVin,
    snapshotFromFields,
    snapshotFromHandler,
} from "../../../src/packages/kelec-driving/services/cloudReading";
import { DrivingRepository } from "../../../src/packages/kelec-driving/services/drivingRepository";

const MINUTE = 60_000;
const T0 = 1_700_000_000_000;

function point(
    sequence: number,
    minute: number,
    odometerKm: number,
    energyKwh: number,
    extra: Partial<DrivingSample> = {},
): DrivingSample {
    const time = T0 + minute * MINUTE;
    return {
        sequence,
        batteryObservedAtMs: time,
        fetchedAtMs: time,
        odometerKm,
        energyKwh,
        energySource: 'cloud_available_energy',
        socPercent: 50,
        isCharging: false,
        ...extra,
    };
}

function currentOf(last: DrivingSample, extra: Partial<CurrentSnapshot> = {}): CurrentSnapshot {
    return {
        origin: 'renault_cloud',
        batteryObservedAtMs: last.batteryObservedAtMs,
        fetchedAtMs: last.fetchedAtMs,
        socPercent: last.socPercent,
        cloudAvailableEnergyKwh: last.energySource === 'cloud_available_energy' ? last.energyKwh : null,
        cloudCapacityKwh: 50,
        manufacturerRangeKm: 999,
        batteryTemperatureC: 21,
        odometerKm: last.odometerKm,
        isCharging: last.isCharging,
        isPlugged: false,
        ...extra,
    };
}

function inputs(partial: Partial<DrivingInputs> = {}): DrivingInputs {
    return { ...EMPTY_DRIVING_INPUTS, ...partial };
}

function fresh(last: DrivingSample): number {
    return (last.batteryObservedAtMs ?? 0) + MINUTE;
}

describe('tendance entre relevés cloud', () => {
    const start = point(1, 0, 100, 40);
    const middle = point(2, 10, 120, 36);

    test('amélioration : le dernier intervalle consomme moins et la réserve à l\'arrivée augmente', () => {
        const latest = point(3, 20, 140, 33);
        const result = evaluateDriving(
            [start, middle, latest],
            inputs({ routeRemainingKm: 100, odometerKmAtRouteEntry: 140 }),
            currentOf(latest),
            fresh(latest),
        );

        expect(result.trend).toBe('improving');
        expect(result.recentConsumptionKwhPer100Km).toBeCloseTo(15);
        expect(result.referenceConsumptionKwhPer100Km).toBeCloseTo(20);
        expect(result.reserveDeltaKwh).toBeCloseTo(5);
        expect(result.arrivalStatus).toBe('ok');
        expect(result.arrivalKwh).toBeCloseTo(18);
        expect(result.arrivalPercent).toBeCloseTo(36);
        expect(result.consumptionSource).toBe('snapshot_intervals');
        expect(result.reasons).toContain('not_realtime');
        expect(result.reasons).not.toContain('manual_estimate');
    });

    test('dégradation : le dernier intervalle consomme plus et la réserve baisse', () => {
        const latest = point(3, 20, 140, 31);
        const result = evaluateDriving(
            [start, middle, latest],
            inputs({ routeRemainingKm: 100, odometerKmAtRouteEntry: 140 }),
            currentOf(latest),
            fresh(latest),
        );

        expect(result.trend).toBe('worsening');
        expect(result.recentConsumptionKwhPer100Km).toBeCloseTo(25);
        expect(result.referenceConsumptionKwhPer100Km).toBeCloseTo(20);
        expect(result.reserveDeltaKwh).toBeCloseTo(-5);
        expect(result.arrivalKwh).toBeCloseTo(6);
        expect(result.arrivalPercent).toBeCloseTo(12);
    });

    test('stable dans la bande de 5 %', () => {
        const latest = point(3, 20, 140, 31.9);
        const result = evaluateDriving([start, middle, latest], inputs(), currentOf(latest), fresh(latest));
        expect(result.trend).toBe('stable');
        expect(result.recentConsumptionKwhPer100Km).toBeCloseTo(20.5);
    });

    test('arrêt : distance nulle, pas de consommation infinie', () => {
        const stopped = point(3, 30, 120, 35);
        const result = evaluateDriving([start, middle, stopped], inputs(), currentOf(stopped), fresh(stopped));

        expect(result.trend).toBe('stationary');
        expect(result.reasons).toContain('zero_distance');
        expect(result.recentConsumptionKwhPer100Km).toBeNull();
        expect(result.consumptionSource).toBe('none');
        expect(result.validIntervalCount).toBe(1);
        expect(Number.isFinite(result.arrivalKwh ?? 0)).toBe(true);
    });

    test('distance trop courte pour un intervalle', () => {
        const tiny = point(2, 10, 101.5, 39);
        const result = evaluateDriving([start, tiny], inputs(), currentOf(tiny), fresh(tiny));
        expect(result.trend).toBe('insufficient');
        expect(result.reasons).toContain('distance_too_small');
        expect(result.validIntervalCount).toBe(0);
    });

    test('échauffement : un seul intervalle ne fait pas un trend', () => {
        const result = evaluateDriving(
            [start, middle],
            inputs({ routeRemainingKm: 100, odometerKmAtRouteEntry: 120 }),
            currentOf(middle),
            fresh(middle),
        );
        expect(result.trend).toBe('warmup');
        expect(result.reasons).toContain('warmup');
        expect(result.referenceConsumptionKwhPer100Km).toBeNull();
        expect(result.reserveDeltaKwh).toBeNull();
        expect(result.recentConsumptionKwhPer100Km).toBeCloseTo(20);
        expect(result.arrivalKwh).toBeCloseTo(16);
    });

    test('données insuffisantes : un seul relevé frais', () => {
        const result = evaluateDriving([start], inputs(), currentOf(start), fresh(start));
        expect(result.trend).toBe('insufficient');
        expect(result.reasons).toContain('insufficient_intervals');
        expect(result.arrivalStatus).toBe('unavailable');
    });

    test('relevé périmé : le trend latent n\'est pas présenté comme actuel', () => {
        const latest = point(3, 20, 140, 33);
        const result = evaluateDriving(
            [start, middle, latest],
            inputs({ routeRemainingKm: 100, odometerKmAtRouteEntry: 140, manualConsumptionKwhPer100Km: null }),
            currentOf(latest),
            (latest.batteryObservedAtMs ?? 0) + DRIVING_LIMITS.staleMs + MINUTE,
        );

        expect(result.trend).toBe('stale');
        expect(result.reasons).toContain('stale_snapshot');
        expect(result.latentTrend).toBe('improving');
        expect(result.recentConsumptionKwhPer100Km).toBeNull();
        expect(result.consumptionSource).toBe('none');
        expect(result.arrivalStatus).toBe('unavailable');
    });

    test('désordre : les relevés ne sont pas réordonnés pour fabriquer un intervalle', () => {
        const backwards = point(3, 5, 160, 30);
        const now = T0 + 21 * MINUTE;
        const result = evaluateDriving([start, middle, backwards], inputs(), currentOf(backwards), now);

        expect(result.trend).toBe('out_of_order');
        expect(result.reasons).toContain('out_of_order');
        expect(result.validIntervalCount).toBe(1);
        expect(result.recentConsumptionKwhPer100Km).toBeNull();
        expect(result.snapshotAgeMs).toBeLessThan(DRIVING_LIMITS.staleMs);
    });

    test('le timestamp batterie inchangé ne crée pas une consommation gratuite', () => {
        const sameBattery = point(2, 0, 130, 40);
        const result = evaluateDriving(
            [start, sameBattery],
            inputs({ routeRemainingKm: 80, odometerKmAtRouteEntry: 100 }),
            currentOf(sameBattery),
            fresh(start),
        );
        expect(result.reasons).toContain('battery_snapshot_unchanged');
        expect(result.validIntervalCount).toBe(0);
        expect(result.remainingRouteKm).toBeCloseTo(50);
        expect(result.routeSource).toBe('manual_reduced_by_odometer');
        expect(result.arrivalStatus).toBe('unavailable');
    });

    test('le doublon n\'est pas ajouté à l\'historique', () => {
        const appended = appendSample([start], { ...start, sequence: 2, fetchedAtMs: start.fetchedAtMs + 5 });
        expect(appended.accepted).toBe(false);
        expect(appended.reason).toBe('duplicate');
        expect(appended.samples).toHaveLength(1);
    });
});

describe('arrivée, capacité et distance de route', () => {
    const now = T0 + MINUTE;
    const parked = point(1, 0, 1000, 30);

    test('distance de route nulle : l\'arrivée est l\'énergie actuelle', () => {
        const result = evaluateDriving(
            [parked],
            inputs({ routeRemainingKm: 0 }),
            currentOf(parked),
            now,
        );
        expect(result.arrivalStatus).toBe('zero_distance');
        expect(result.reasons).toContain('zero_route_distance');
        expect(result.arrivalKwh).toBeCloseTo(30);
        expect(result.arrivalPercent).toBeCloseTo(60);
        expect(result.remainingRouteKm).toBe(0);
    });

    test('le compteur réduit le kilométrage saisi, sans ligne droite', () => {
        const result = evaluateDriving(
            [],
            inputs({ routeRemainingKm: 80, odometerKmAtRouteEntry: 1000 }),
            currentOf(parked, { odometerKm: 1010 }),
            now,
        );
        expect(result.remainingRouteKm).toBeCloseTo(70);
        expect(result.routeSource).toBe('manual_reduced_by_odometer');
    });

    test('sans compteur au moment de la saisie, le nombre reste celui qui a été écrit', () => {
        const result = evaluateDriving(
            [],
            inputs({ routeRemainingKm: 80, odometerKmAtRouteEntry: null }),
            currentOf(parked),
            now,
        );
        expect(result.remainingRouteKm).toBe(80);
        expect(result.routeSource).toBe('manual_unadjusted');
    });

    test('compteur incohérent : on ne rallonge pas la route', () => {
        const result = evaluateDriving(
            [],
            inputs({ routeRemainingKm: 80, odometerKmAtRouteEntry: 1100 }),
            currentOf(parked),
            now,
        );
        expect(result.remainingRouteKm).toBe(80);
        expect(result.routeSource).toBe('inconsistent_odometer');
    });

    test('capacité invalide : pas de pourcentage, l\'énergie cloud reste utilisable', () => {
        const result = evaluateDriving(
            [],
            inputs({
                usableCapacityKwh: -5,
                routeRemainingKm: 10,
                odometerKmAtRouteEntry: 1000,
                manualConsumptionKwhPer100Km: 15,
            }),
            currentOf(parked, { cloudCapacityKwh: 52 }),
            now,
        );
        expect(result.capacityStatus).toBe('invalid');
        expect(result.capacitySource).toBe('none');
        expect(result.reasons).toContain('invalid_capacity');
        expect(result.arrivalPercent).toBeNull();
        expect(result.arrivalKwh).toBeCloseTo(28.5);
        expect(result.arrivalStatus).toBe('ok');
        expect(result.consumptionSource).toBe('manual_estimate');
    });

    test('capacité nulle ou non finie ne retombe pas sur la valeur cloud', () => {
        for (const usableCapacityKwh of [0, Number.NaN, Number.POSITIVE_INFINITY]) {
            const result = evaluateDriving(
                [],
                inputs({ usableCapacityKwh }),
                currentOf(parked, { cloudAvailableEnergyKwh: null, cloudCapacityKwh: 52, socPercent: 50 }),
                now,
            );
            expect(result.capacityStatus).toBe('invalid');
            expect(result.energyNowKwh).toBeNull();
            expect(result.energySource).toBe('unavailable');
        }
    });

    test('arrivée injoignable et pourcentage négatif', () => {
        const low = point(1, 0, 1000, 10);
        const result = evaluateDriving(
            [low],
            inputs({
                routeRemainingKm: 100,
                odometerKmAtRouteEntry: 1000,
                manualConsumptionKwhPer100Km: 20,
                usableCapacityKwh: 40,
            }),
            currentOf(low, { cloudCapacityKwh: null }),
            now,
        );
        expect(result.arrivalStatus).toBe('unreachable');
        expect(result.reasons).toContain('unreachable');
        expect(result.arrivalKwh).toBeCloseTo(-10);
        expect(result.arrivalPercent).toBeCloseTo(-25);
    });

    test('arrivée négative sans pourcentage si la capacité est invalide', () => {
        const low = point(1, 0, 1000, 5);
        const result = evaluateDriving(
            [low],
            inputs({
                routeRemainingKm: 100,
                manualConsumptionKwhPer100Km: 20,
                usableCapacityKwh: 0,
            }),
            currentOf(low),
            now,
        );
        expect(result.arrivalStatus).toBe('unreachable');
        expect(result.arrivalKwh).toBeCloseTo(-15);
        expect(result.arrivalPercent).toBeNull();
        expect(result.capacityStatus).toBe('invalid');
    });

    test('l\'autonomie constructeur ne sert pas de consommation', () => {
        const result = evaluateDriving(
            [],
            inputs({ routeRemainingKm: 50, odometerKmAtRouteEntry: 1000 }),
            currentOf(parked, { manufacturerRangeKm: 999 }),
            now,
        );
        expect(result.arrivalStatus).toBe('unavailable');
        expect(result.consumptionSource).toBe('none');
        expect(result.recentConsumptionKwhPer100Km).toBeNull();
    });

    test('le saisi manuel est ignoré dès qu\'un intervalle mesuré existe', () => {
        const latest = point(2, 10, 120, 36);
        const result = evaluateDriving(
            [point(1, 0, 100, 40), latest],
            inputs({
                routeRemainingKm: 100,
                odometerKmAtRouteEntry: 120,
                manualConsumptionKwhPer100Km: 99,
            }),
            currentOf(latest),
            fresh(latest),
        );
        expect(result.trend).toBe('warmup');
        expect(result.consumptionSource).toBe('snapshot_intervals');
        expect(result.recentConsumptionKwhPer100Km).toBeCloseTo(20);
        expect(result.arrivalKwh).toBeCloseTo(16);
    });

    test('aucune route par défaut', () => {
        const result = evaluateDriving([parked], inputs(), currentOf(parked), now);
        expect(result.routeSource).toBe('unset');
        expect(result.remainingRouteKm).toBeNull();
        expect(result.arrivalStatus).toBe('unavailable');
    });
});

describe('lecture des champs Renault déjà typés', () => {
    test('batteryAvailableEnergy prime sur % × capacité, et une capacité 0 est absente', () => {
        const snapshot = snapshotFromFields({
            timestamp: '2024-03-30T19:28:15Z',
            batteryLevel: 56,
            batteryCapacity: 0,
            batteryAvailableEnergy: 34,
            batteryAutonomy: 202,
            batteryTemperature: 20,
            totalMileage: 30995.16,
            isCharging: false,
            isPlugged: false,
        }, 'renault_cloud', T0);
        expect(snapshot.cloudAvailableEnergyKwh).toBe(34);
        expect(snapshot.cloudCapacityKwh).toBeNull();
        expect(snapshot.socPercent).toBe(56);
        expect(snapshot.manufacturerRangeKm).toBe(202);
        expect(snapshot.odometerKm).toBeCloseTo(30995.16);
        expect(snapshot.batteryObservedAtMs).toBe(Date.parse('2024-03-30T19:28:15Z'));
    });

    test('énergie = % × capacité saisie seulement sans kWh cloud', () => {
        const current: CurrentSnapshot = {
            origin: 'renault_cloud',
            batteryObservedAtMs: T0,
            fetchedAtMs: T0,
            socPercent: 50,
            cloudAvailableEnergyKwh: null,
            cloudCapacityKwh: null,
            manufacturerRangeKm: null,
            batteryTemperatureC: null,
            odometerKm: 10,
            isCharging: false,
            isPlugged: false,
        };
        const sample = sampleFromCurrent(current, inputs({ usableCapacityKwh: 40 }), 1);
        expect(sample.energyKwh).toBeCloseTo(20);
        expect(sample.energySource).toBe('soc_times_capacity');
    });

    test('deux sources d\'énergie différentes ne forment pas un intervalle', () => {
        const cloud = point(1, 0, 100, 40);
        const estimated = point(2, 10, 120, 36, { energySource: 'soc_times_capacity' });
        const result = evaluateDriving([cloud, estimated], inputs(), currentOf(estimated, {
            cloudAvailableEnergyKwh: null,
            socPercent: 50,
        }), fresh(estimated));
        expect(result.reasons).toContain('energy_source_changed');
        expect(result.validIntervalCount).toBe(0);
    });

    test('Hyundai : pas de vitesse inventée, snapshot vide', () => {
        const snapshot = snapshotFromHandler({}, 'unsupported', T0);
        expect(snapshot.origin).toBe('unsupported');
        expect(snapshot.odometerKm).toBeNull();
        expect(snapshot.cloudAvailableEnergyKwh).toBeNull();
        const result = evaluateDriving([], inputs(), snapshot, T0 + MINUTE);
        expect(result.trend).toBe('insufficient');
        expect(result.reasons).toContain('unsupported_source');
    });

    test('la démo reprend les chiffres statiques, y compris la charge, sans capacité', () => {
        const snapshot = snapshotFromDemoVin('VF1AA', T0);
        expect(snapshot.origin).toBe('demo');
        expect(snapshot.cloudAvailableEnergyKwh).toBe(34);
        expect(snapshot.cloudCapacityKwh).toBeNull();
        expect(snapshot.isCharging).toBe(true);
        expect(snapshot.isPlugged).toBe(true);
        expect(snapshot.odometerKm).toBeCloseTo(30995.16015625);
        expect(isRenaultCharging(1)).toBe(true);
        expect(isRenaultCharging(0)).toBe(false);
    });

    test('nombres saisis : virgule, vide, texte', () => {
        expect(parseUserDecimal(' 12,5 ')).toEqual({ ok: true, value: 12.5 });
        expect(parseUserDecimal('')).toEqual({ ok: true, value: null });
        expect(parseUserDecimal('abc').ok).toBe(false);
    });
});

describe('DrivingRepository', () => {
    beforeEach(async () => {
        await AsyncStorage.clear();
    });

    test('ne préremplit pas de trajet', async () => {
        const loaded = await DrivingRepository.load('VIN');
        expect(loaded.samples).toEqual([]);
        expect(loaded.inputs).toEqual(EMPTY_DRIVING_INPUTS);

        const sample = point(1, 0, 10, 20);
        await DrivingRepository.saveSamples('VIN', [sample]);
        await DrivingRepository.saveInputs('VIN', inputs({ routeRemainingKm: 12, usableCapacityKwh: 40 }));
        const again = await DrivingRepository.load('VIN');
        expect(again.samples).toEqual([sample]);
        expect(again.inputs.routeRemainingKm).toBe(12);
        expect(again.inputs.usableCapacityKwh).toBe(40);
        expect(await AsyncStorage.getItem('VIN/drivingSamples')).not.toBeNull();
    });
});
