import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Account from "../../../lib/clients/accounts/account";
import CarModel from "../../../lib/clients/cars/carModel";
import { VinStorage } from "../../kelec-storage/vinStorage";
import {
    CurrentSnapshot,
    DrivingInputs,
    DrivingSample,
    EMPTY_DRIVING_INPUTS,
    appendSample,
    emptySnapshot,
    sampleFromCurrent,
} from "../services/drivingEstimate";
import {
    originFor,
    snapshotFromCloudPayloads,
    snapshotFromDemoVin,
    withZoeChargingFix,
} from "../services/cloudReading";
import { DrivingRepository } from "../services/drivingRepository";

type DrivingController = {
    samples: DrivingSample[];
    inputs: DrivingInputs;
    current: CurrentSnapshot;
    ready: boolean;
    refreshing: boolean;
    refreshFailed: boolean;
    record: (snapshot: CurrentSnapshot) => void;
    saveInputs: (partial: Partial<DrivingInputs>) => Promise<void>;
    clearSamples: () => Promise<void>;
    /** Rafraîchissement manuel. Réutilise celui de la page voiture s'il est monté. */
    refreshCloud: () => Promise<void>;
    registerRefresh: (refresh: (() => Promise<void>) | null) => void;
};

const DrivingContext = createContext<DrivingController>({
    samples: [],
    inputs: EMPTY_DRIVING_INPUTS,
    current: emptySnapshot('unsupported', 0),
    ready: false,
    refreshing: false,
    refreshFailed: false,
    record: () => { },
    saveInputs: async () => { },
    clearSamples: async () => { },
    refreshCloud: async () => { },
    registerRefresh: () => { },
});

export const useDriving = (): DrivingController => useContext(DrivingContext);

type Props = {
    readonly carModel: CarModel;
    readonly account: Account;
    readonly children: React.ReactNode;
};

/**
 * Historique local des odczytów déjà chargés par la page voiture.
 * Aucun minuteur réseau : un appel part seulement sur `refreshCloud`.
 */
export function DrivingProvider({ carModel, account, children }: Props): React.JSX.Element {
    const vin = carModel.getVin();
    const origin = originFor(carModel.getCarmaker());

    const [samples, setSamples] = useState<DrivingSample[]>([]);
    const [inputs, setInputs] = useState<DrivingInputs>(EMPTY_DRIVING_INPUTS);
    const [current, setCurrent] = useState<CurrentSnapshot>(() => emptySnapshot(origin, Date.now()));
    const [ready, setReady] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [refreshFailed, setRefreshFailed] = useState(false);

    const samplesRef = useRef<DrivingSample[]>([]);
    const inputsRef = useRef<DrivingInputs>(EMPTY_DRIVING_INPUTS);
    const readyRef = useRef(false);
    const pendingRef = useRef<CurrentSnapshot[]>([]);
    const refreshRef = useRef<(() => Promise<void>) | null>(null);
    const refreshLock = useRef(false);
    const mounted = useRef(true);

    const commit = useCallback((snapshot: CurrentSnapshot) => {
        if (mounted.current) setCurrent(snapshot);
        if (snapshot.origin === 'unsupported') return;
        const sequence = samplesRef.current.reduce((max, sample) => Math.max(max, sample.sequence), 0) + 1;
        const sample = sampleFromCurrent(snapshot, inputsRef.current, sequence);
        const next = appendSample(samplesRef.current, sample);
        if (!next.accepted) return;
        samplesRef.current = next.samples;
        if (mounted.current) setSamples(next.samples);
        DrivingRepository.saveSamples(vin, next.samples).catch(() => undefined);
    }, [vin]);

    useEffect(() => {
        mounted.current = true;
        let cancelled = false;
        readyRef.current = false;
        setReady(false);
        DrivingRepository.load(vin).then(stored => {
            if (cancelled) return;
            samplesRef.current = stored.samples;
            inputsRef.current = stored.inputs;
            setSamples(stored.samples);
            setInputs(stored.inputs);
            readyRef.current = true;
            setReady(true);
            pendingRef.current.forEach(commit);
            pendingRef.current = [];
        });
        return () => {
            cancelled = true;
            mounted.current = false;
        };
    }, [vin, commit]);

    const record = useCallback((snapshot: CurrentSnapshot) => {
        if (!readyRef.current) {
            pendingRef.current.push(snapshot);
            if (mounted.current) setCurrent(snapshot);
            return;
        }
        commit(snapshot);
    }, [commit]);

    const saveInputs = useCallback(async (partial: Partial<DrivingInputs>) => {
        const next = { ...inputsRef.current, ...partial };
        inputsRef.current = next;
        if (mounted.current) setInputs(next);
        await DrivingRepository.saveInputs(vin, next);
    }, [vin]);

    const clearSamples = useCallback(async () => {
        samplesRef.current = [];
        if (mounted.current) setSamples([]);
        await DrivingRepository.saveSamples(vin, []);
    }, [vin]);

    const registerRefresh = useCallback((refresh: (() => Promise<void>) | null) => {
        refreshRef.current = refresh;
    }, []);

    const refreshCloud = useCallback(async () => {
        if (refreshLock.current) return;
        refreshLock.current = true;
        setRefreshing(true);
        setRefreshFailed(false);
        try {
            if (refreshRef.current) {
                await refreshRef.current();
                return;
            }
            if (origin === 'demo') {
                record(snapshotFromDemoVin(vin, Date.now()));
                return;
            }
            if (origin === 'unsupported') return;

            const fetchedAt = Date.now();
            const battery = withZoeChargingFix(await account.fetchCarStatus(vin));
            if (battery.hasError) {
                setRefreshFailed(true);
                return;
            }
            await VinStorage.setJSON(vin, 'batteryStatus', battery);
            const cockpit = await account.fetchCarCockpit(vin);
            if (!cockpit.hasError) await VinStorage.setJSON(vin, 'cockpitStatus', cockpit);
            const snapshot = snapshotFromCloudPayloads(battery, cockpit, fetchedAt);
            if (snapshot.batteryObservedAtMs === null && snapshot.socPercent === null && snapshot.odometerKm === null) {
                setRefreshFailed(true);
                return;
            }
            record(snapshot);
        } catch {
            setRefreshFailed(true);
        } finally {
            refreshLock.current = false;
            if (mounted.current) setRefreshing(false);
        }
    }, [account, origin, record, vin]);

    const value = useMemo(() => ({
        samples,
        inputs,
        current,
        ready,
        refreshing,
        refreshFailed,
        record,
        saveInputs,
        clearSamples,
        refreshCloud,
        registerRefresh,
    }), [
        samples,
        inputs,
        current,
        ready,
        refreshing,
        refreshFailed,
        record,
        saveInputs,
        clearSamples,
        refreshCloud,
        registerRefresh,
    ]);

    return (
        <DrivingContext.Provider value={value}>
            {children}
        </DrivingContext.Provider>
    );
}
