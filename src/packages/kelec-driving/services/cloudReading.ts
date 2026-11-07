import { CarMaker } from "../../../lib/clients/accounts/account";
import { demoCarData } from "../../../lib/clients/accounts/demoCars";
import { CurrentSnapshot, SnapshotOrigin, emptySnapshot } from "./drivingEstimate";

/**
 * Pola już obecne w odpowiedzi Kamereon (`battery-status` v2 i `cockpit` v1).
 * Brak prędkości, mocy w jeździe i czasu pomiaru licznika.
 */
export type RenaultDrivingFields = {
    timestamp?: string;
    batteryLevel?: number;
    batteryTemperature?: number;
    batteryAutonomy?: number;
    batteryCapacity?: number;
    batteryAvailableEnergy?: number;
    totalMileage?: number;
    isCharging: boolean;
    isPlugged: boolean;
};

export function originFor(maker: CarMaker): SnapshotOrigin {
    switch (maker) {
        case CarMaker.HYUNDAI:
            return 'unsupported';
        case CarMaker.DEMO:
            return 'demo';
        default:
            return 'renault_cloud';
    }
}

/** Ten sam próg co `RenaultApiHandler.getIsCarCharging` (w tym V2G / V2L). */
export function isRenaultCharging(chargingStatus: number | undefined): boolean {
    if (chargingStatus === undefined) return false;
    return chargingStatus === 1.0 || chargingStatus <= -1.3;
}

export function isRenaultPlugged(plugStatus: number | undefined): boolean {
    return plugStatus === 1;
}

/**
 * Bug Zoe 1re génération, recopié de `RenaultCarLoader` pour le repli
 * quand l'écran voiture est démonté. Ne concerne pas la Renault 5.
 */
export function withZoeChargingFix<T extends { apiData?: { chargingStatus?: number; batteryLevel?: number } }>(payload: T): T {
    const data = payload.apiData;
    if (data?.chargingStatus === -1.1 && (data.batteryLevel ?? 0) < 100) {
        data.chargingStatus = 1.0;
    }
    return payload;
}

function finite(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveOrNull(value: number | undefined): number | null {
    const parsed = finite(value);
    return parsed !== null && parsed > 0 ? parsed : null;
}

function nonNegativeOrNull(value: number | undefined): number | null {
    const parsed = finite(value);
    return parsed !== null && parsed >= 0 ? parsed : null;
}

export function snapshotFromFields(
    fields: RenaultDrivingFields | null,
    origin: SnapshotOrigin,
    fetchedAtMs: number,
): CurrentSnapshot {
    if (origin === 'unsupported' || fields === null) {
        return emptySnapshot(origin === 'unsupported' ? 'unsupported' : origin, fetchedAtMs);
    }
    const observed = fields.timestamp === undefined ? Number.NaN : Date.parse(fields.timestamp);
    const soc = finite(fields.batteryLevel);
    return {
        origin,
        batteryObservedAtMs: Number.isFinite(observed) ? observed : null,
        fetchedAtMs,
        socPercent: soc !== null && soc >= 0 && soc <= 100 ? soc : null,
        cloudAvailableEnergyKwh: nonNegativeOrNull(fields.batteryAvailableEnergy),
        cloudCapacityKwh: positiveOrNull(fields.batteryCapacity),
        manufacturerRangeKm: nonNegativeOrNull(fields.batteryAutonomy),
        batteryTemperatureC: finite(fields.batteryTemperature),
        odometerKm: nonNegativeOrNull(fields.totalMileage),
        isCharging: fields.isCharging,
        isPlugged: fields.isPlugged,
    };
}

type MaybeDrivingHandler = {
    getDrivingFields?: () => RenaultDrivingFields;
};

export function snapshotFromHandler(
    handler: object,
    origin: SnapshotOrigin,
    fetchedAtMs: number,
): CurrentSnapshot {
    const candidate = handler as MaybeDrivingHandler;
    if (origin === 'unsupported' || typeof candidate.getDrivingFields !== 'function') {
        return emptySnapshot('unsupported', fetchedAtMs);
    }
    return snapshotFromFields(candidate.getDrivingFields(), origin, fetchedAtMs);
}

type CloudPayload = {
    hasError?: boolean;
    apiData?: {
        timestamp?: string;
        batteryLevel?: number;
        batteryTemperature?: number;
        batteryAutonomy?: number;
        batteryCapacity?: number;
        batteryAvailableEnergy?: number;
        chargingStatus?: number;
        plugStatus?: number;
        totalMileage?: number;
    };
};

/** Repli quand l'écran voiture est démonté : mêmes champs que le cache du loader, sans nouvel endpoint. */
export function snapshotFromCloudPayloads(
    battery: CloudPayload | null,
    cockpit: CloudPayload | null,
    fetchedAtMs: number,
): CurrentSnapshot {
    const batteryData = battery && !battery.hasError ? battery.apiData : undefined;
    const cockpitData = cockpit && !cockpit.hasError ? cockpit.apiData : undefined;
    if (!batteryData) return emptySnapshot('renault_cloud', fetchedAtMs);
    return snapshotFromFields({
        timestamp: batteryData.timestamp,
        batteryLevel: batteryData.batteryLevel,
        batteryTemperature: batteryData.batteryTemperature,
        batteryAutonomy: batteryData.batteryAutonomy,
        batteryCapacity: batteryData.batteryCapacity,
        batteryAvailableEnergy: batteryData.batteryAvailableEnergy,
        totalMileage: cockpitData?.totalMileage,
        isCharging: isRenaultCharging(batteryData.chargingStatus),
        isPlugged: isRenaultPlugged(batteryData.plugStatus),
    }, 'renault_cloud', fetchedAtMs);
}

/** Même chiffres que le mode démo, sans réseau et sans trajet inventé. */
export function snapshotFromDemoVin(vin: string, fetchedAtMs: number): CurrentSnapshot {
    const data = demoCarData(vin);
    return snapshotFromFields({
        timestamp: new Date(fetchedAtMs).toISOString(),
        batteryLevel: data.battery.batteryLevel,
        batteryTemperature: data.battery.batteryTemperature,
        batteryAutonomy: data.battery.batteryAutonomy,
        batteryCapacity: data.battery.batteryCapacity,
        batteryAvailableEnergy: data.battery.batteryAvailableEnergy,
        totalMileage: data.cockpit.totalMileage,
        isCharging: isRenaultCharging(data.battery.chargingStatus),
        isPlugged: isRenaultPlugged(data.battery.plugStatus),
    }, 'demo', fetchedAtMs);
}
