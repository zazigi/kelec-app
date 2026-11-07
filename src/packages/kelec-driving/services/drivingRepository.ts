import { VinStorage } from "../../kelec-storage/vinStorage";
import { DrivingInputs, DrivingSample, EMPTY_DRIVING_INPUTS } from "./drivingEstimate";

const SAMPLES_KEY = 'drivingSamples';
const INPUTS_KEY = 'drivingInputs';

function isSample(value: unknown): value is DrivingSample {
    if (typeof value !== 'object' || value === null) return false;
    const sample = value as DrivingSample;
    return typeof sample.sequence === 'number' && typeof sample.fetchedAtMs === 'number';
}

function readInputs(value: unknown): DrivingInputs {
    if (typeof value !== 'object' || value === null) return { ...EMPTY_DRIVING_INPUTS };
    const raw = value as Partial<DrivingInputs>;
    return {
        usableCapacityKwh: typeof raw.usableCapacityKwh === 'number' ? raw.usableCapacityKwh : null,
        routeRemainingKm: typeof raw.routeRemainingKm === 'number' ? raw.routeRemainingKm : null,
        odometerKmAtRouteEntry: typeof raw.odometerKmAtRouteEntry === 'number' ? raw.odometerKmAtRouteEntry : null,
        manualConsumptionKwhPer100Km: typeof raw.manualConsumptionKwhPer100Km === 'number' ? raw.manualConsumptionKwhPer100Km : null,
    };
}

export const DrivingRepository = {
    async load(vin: string): Promise<{ samples: DrivingSample[]; inputs: DrivingInputs }> {
        try {
            const [samples, inputs] = await Promise.all([
                VinStorage.getJSON<unknown>(vin, SAMPLES_KEY),
                VinStorage.getJSON<unknown>(vin, INPUTS_KEY),
            ]);
            return {
                samples: Array.isArray(samples) ? samples.filter(isSample) : [],
                inputs: readInputs(inputs),
            };
        } catch {
            return { samples: [], inputs: { ...EMPTY_DRIVING_INPUTS } };
        }
    },

    async saveSamples(vin: string, samples: readonly DrivingSample[]): Promise<void> {
        await VinStorage.setJSON(vin, SAMPLES_KEY, samples);
    },

    async saveInputs(vin: string, inputs: DrivingInputs): Promise<void> {
        await VinStorage.setJSON(vin, INPUTS_KEY, inputs);
    },
};
