import { useEffect, useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, useColorScheme, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Text from "../../../screen/Common/CustomText";
import { getBlackColour, getWhiteColour } from "../../../lib/graphics/utils";
import commonStyles, { fontFamilyBold, fontWeightBold } from "../../../lib/graphics/commonStyle";
import PageHeader from "../../kelec-model/view/PageHeader";
import { useCarLocation } from "../../kelec-map";
import { useDriving } from "../controllers/DrivingProvider";
import { DrivingAssessment, evaluateDriving, parseUserDecimal, TrendStatus } from "../services/drivingEstimate";
import { COPY, MISSING_MEASUREMENTS, reasonLines, routeSourceLabel, trendDetail, trendTitle } from "./copy";
import { formatAgePl, formatInputNumber, formatMeasure, formatSigned } from "./format";

type Props = {
    readonly navigation: { goBack: () => void };
};

const TREND_COLOR: Record<TrendStatus, string> = {
    improving: '#1F7A4D',
    worsening: '#B42318',
    stable: '#4D4D4D',
    stationary: '#8A5A00',
    warmup: '#8A5A00',
    insufficient: '#8A5A00',
    stale: '#8A5A00',
    out_of_order: '#B42318',
};

function useClock(intervalMs: number): number {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), intervalMs);
        return () => clearInterval(id);
    }, [intervalMs]);
    return now;
}

function DrivingDashboardView({ navigation }: Props): React.JSX.Element {
    const isDarkMode = useColorScheme() === 'dark';
    const ink = getBlackColour(isDarkMode);
    const now = useClock(30_000);
    const { location } = useCarLocation();
    const driving = useDriving();
    const { samples, inputs, current } = driving;
    const assessment = useMemo(
        () => evaluateDriving(samples, inputs, current, now),
        [samples, inputs, current, now],
    );

    const [routeText, setRouteText] = useState('');
    const [capacityText, setCapacityText] = useState('');
    const [manualText, setManualText] = useState('');
    const [formMessage, setFormMessage] = useState('');
    const seeded = useRef(false);

    useEffect(() => {
        if (!driving.ready || seeded.current) return;
        seeded.current = true;
        setRouteText(formatInputNumber(inputs.routeRemainingKm));
        setCapacityText(formatInputNumber(inputs.usableCapacityKwh));
        setManualText(formatInputNumber(inputs.manualConsumptionKwhPer100Km));
    }, [driving.ready, inputs]);

    const saveRoute = async () => {
        const parsed = parseUserDecimal(routeText);
        if (!parsed.ok) {
            setFormMessage(COPY.badNumber);
            return;
        }
        await driving.saveInputs({
            routeRemainingKm: parsed.value,
            odometerKmAtRouteEntry: parsed.value === null ? null : current.odometerKm,
        });
        setFormMessage(COPY.saved);
    };

    const saveEstimates = async () => {
        const capacity = parseUserDecimal(capacityText);
        const manual = parseUserDecimal(manualText);
        if (!capacity.ok || !manual.ok) {
            setFormMessage(COPY.badNumber);
            return;
        }
        await driving.saveInputs({
            usableCapacityKwh: capacity.value,
            manualConsumptionKwhPer100Km: manual.value,
        });
        setFormMessage(COPY.saved);
    };

    const clearRoute = async () => {
        setRouteText('');
        await driving.saveInputs({ routeRemainingKm: null, odometerKmAtRouteEntry: null });
        setFormMessage(COPY.saved);
    };

    const batteryAge = formatAgePl(assessment.snapshotAgeMs);
    const fetchAge = formatAgePl(now - current.fetchedAtMs);
    const gpsAge = location ? formatAgePl(now - location.updatedAt.getTime()) : null;

    return (
        <SafeAreaView
            style={[commonStyles.flex, { backgroundColor: getWhiteColour(isDarkMode) }]}
            edges={['top', 'left', 'right']}
            testID="drivingDashboard"
        >
            <PageHeader title={COPY.title} onBack={() => navigation.goBack()} />
            <KeyboardAvoidingView style={commonStyles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
                <ScrollView
                    contentInsetAdjustmentBehavior="automatic"
                    keyboardShouldPersistTaps="handled"
                    contentContainerStyle={styles.content}
                >
                    <Text style={styles.warning}>{COPY.glanceWarning}</Text>
                    {current.origin === 'demo' && <Text style={styles.banner}>{COPY.demo}</Text>}
                    {current.origin === 'unsupported' && <Text style={styles.banner}>{COPY.unsupported}</Text>}

                    <Text testID="drivingTrend" style={[styles.trend, { color: TREND_COLOR[assessment.trend] }]}>
                        {trendTitle(assessment.trend)}
                    </Text>
                    <Text style={[styles.detail, { color: ink }]}>{trendDetail(assessment.trend)}</Text>

                    <Text style={styles.section}>{COPY.arrival}</Text>
                    <ArrivalFigures assessment={assessment} color={ink} />

                    <Text style={styles.section}>{COPY.remaining}</Text>
                    <Text testID="drivingRemainingKm" style={[styles.figure, { color: ink }]}>
                        {assessment.remainingRouteKm === null ? '—' : `${formatMeasure(assessment.remainingRouteKm, 1)} km`}
                    </Text>
                    <Text style={styles.meta}>{routeSourceLabel(assessment.routeSource)}</Text>

                    <ConsumptionLine assessment={assessment} manualKwhPer100Km={inputs.manualConsumptionKwhPer100Km} />

                    <Text style={styles.section}>{COPY.parameters}</Text>
                    <Parameter
                        label="Naładowanie"
                        value={current.socPercent === null ? '—' : `${formatMeasure(current.socPercent, 0)} %`}
                        meta={`battery-status · % · czas pojazdu: ${batteryAge}`}
                    />
                    <Parameter
                        label="Energia"
                        value={assessment.energyNowKwh === null ? '—' : `${formatMeasure(assessment.energyNowKwh, 1)} kWh`}
                        meta={energyMeta(assessment, batteryAge)}
                    />
                    <Parameter
                        label="Pojemność"
                        value={assessment.capacityKwh === null ? '—' : `${formatMeasure(assessment.capacityKwh, 1)} kWh`}
                        meta={capacityMeta(assessment, current.cloudCapacityKwh)}
                    />
                    <Parameter
                        label="Zasięg producenta"
                        value={current.manufacturerRangeKm === null ? '—' : `${formatMeasure(current.manufacturerRangeKm, 0)} km`}
                        meta={`batteryAutonomy · km · szacunek auta, nie pomiar zużycia · ${batteryAge}`}
                    />
                    <Parameter
                        label="Temperatura baterii"
                        value={current.batteryTemperatureC === null ? '—' : `${formatMeasure(current.batteryTemperatureC, 0)} °C`}
                        meta={`batteryTemperature · °C · ${batteryAge}`}
                    />
                    <Parameter
                        label="Licznik"
                        value={current.odometerKm === null ? '—' : `${formatMeasure(current.odometerKm, 1)} km`}
                        meta={`cockpit totalMileage · km · czas pobrania: ${fetchAge}. Czas pomiaru licznika nie przychodzi z chmury.`}
                    />
                    <Parameter
                        label="Ładowanie"
                        value={current.isCharging ? 'tak' : 'nie'}
                        meta={`wtyczka: ${current.isPlugged ? 'tak' : 'nie'} · chargingStatus / plugStatus · ${batteryAge}`}
                    />
                    <Parameter
                        label="Pozycja"
                        value={location ? `${formatMeasure(location.latitude, 4)}°, ${formatMeasure(location.longitude, 4)}°` : '—'}
                        meta={location ? `${COPY.positionNotSpeed} · czas pozycji: ${gpsAge}` : `${COPY.positionUnavailable} ${COPY.noSpeed}`}
                    />

                    <Text style={styles.section}>{COPY.missingTitle}</Text>
                    {MISSING_MEASUREMENTS.map(line => (
                        <Text key={line} style={styles.meta}>{line}</Text>
                    ))}
                    {reasonLines(assessment).map(line => (
                        <Text key={line} style={styles.meta}>{line}</Text>
                    ))}

                    <Text style={styles.section}>{COPY.formTitle}</Text>
                    <Field label={COPY.routeLabel} value={routeText} onChangeText={setRouteText} placeholder={COPY.routePlaceholder} testID="drivingRouteInput" />
                    <View style={styles.actions}>
                        <Action label={COPY.saveRoute} onPress={saveRoute} testID="drivingSaveRoute" />
                        <Action label={COPY.clearRoute} onPress={clearRoute} testID="drivingClearRoute" />
                    </View>
                    <Field label={COPY.capacityLabel} value={capacityText} onChangeText={setCapacityText} placeholder={COPY.capacityPlaceholder} testID="drivingCapacityInput" />
                    <Field label={COPY.manualLabel} value={manualText} onChangeText={setManualText} placeholder={COPY.manualPlaceholder} testID="drivingManualInput" />
                    <Action label={COPY.saveEstimates} onPress={saveEstimates} testID="drivingSaveEstimates" />
                    {formMessage !== '' && <Text style={styles.meta}>{formMessage}</Text>}

                    <Text style={styles.meta}>{COPY.samples}: {driving.samples.length}</Text>
                    <Action
                        label={driving.refreshing ? COPY.refreshing : COPY.refresh}
                        onPress={driving.refreshCloud}
                        testID="drivingRefresh"
                        disabled={driving.refreshing}
                    />
                    {driving.refreshFailed && <Text style={styles.banner}>{COPY.refreshFailed}</Text>}
                    <Action label={COPY.clearSamples} onPress={driving.clearSamples} testID="drivingClearSamples" />
                </ScrollView>
            </KeyboardAvoidingView>
        </SafeAreaView>
    );
}

function ArrivalFigures({ assessment, color }: { assessment: DrivingAssessment; color: string }): React.JSX.Element {
    if (assessment.arrivalStatus === 'unreachable' && assessment.arrivalKwh !== null) {
        return (
            <View>
                <Text testID="drivingArrivalPercent" style={[styles.figure, { color: TREND_COLOR.worsening }]}>{COPY.unreachable}</Text>
                <Text testID="drivingArrivalKwh" style={[styles.subfigure, { color }]}>
                    {COPY.deficit} {formatMeasure(Math.abs(assessment.arrivalKwh), 1)} kWh
                </Text>
                {assessment.arrivalPercent !== null && (
                    <Text style={styles.meta}>Wyliczenie przy podanej pojemności: {formatMeasure(assessment.arrivalPercent, 0)} %</Text>
                )}
            </View>
        );
    }
    if (assessment.arrivalKwh === null) {
        return (
            <View>
                <Text testID="drivingArrivalPercent" style={[styles.figure, { color }]}>—</Text>
                <Text testID="drivingArrivalKwh" style={styles.meta}>{COPY.noArrival}</Text>
            </View>
        );
    }
    return (
        <View>
            <Text testID="drivingArrivalPercent" style={[styles.figure, { color }]}>
                {assessment.arrivalPercent === null ? 'brak %' : `${formatMeasure(assessment.arrivalPercent, 0)} %`}
            </Text>
            <Text testID="drivingArrivalKwh" style={[styles.subfigure, { color }]}>
                {formatMeasure(assessment.arrivalKwh, 1)} kWh
            </Text>
        </View>
    );
}

function ConsumptionLine({ assessment, manualKwhPer100Km }: {
    assessment: DrivingAssessment;
    manualKwhPer100Km: number | null;
}): React.JSX.Element | null {
    const measured = assessment.recentConsumptionKwhPer100Km;
    const manual = assessment.consumptionSource === 'manual_estimate' ? manualKwhPer100Km : null;
    if (measured === null && manual === null && assessment.reserveDeltaKwh === null) return null;
    return (
        <View>
            {measured !== null && (
                <Text style={styles.detail}>
                    Ostatni odcinek: {formatMeasure(measured, 1)} kWh/100 km. {COPY.notRealtime}
                </Text>
            )}
            {assessment.referenceConsumptionKwhPer100Km !== null && (
                <Text style={styles.meta}>
                    Wcześniejsza średnia: {formatMeasure(assessment.referenceConsumptionKwhPer100Km, 1)} kWh/100 km
                </Text>
            )}
            {assessment.reserveDeltaKwh !== null && (
                <Text testID="drivingReserveDelta" style={styles.detail}>
                    Rezerwa na mecie: {formatSigned(assessment.reserveDeltaKwh, 1)} kWh wobec wcześniejszego stylu
                </Text>
            )}
            {manual !== null && (
                <Text style={styles.detail}>
                    Szacunek ręczny: {formatMeasure(manual, 1)} kWh/100 km. To nie jest pomiar stylu jazdy.
                </Text>
            )}
        </View>
    );
}

function energyMeta(assessment: DrivingAssessment, batteryAge: string): string {
    if (assessment.energySource === 'cloud_available_energy') {
        return `batteryAvailableEnergy · kWh · ${batteryAge}`;
    }
    if (assessment.energySource === 'soc_times_capacity') {
        return `stan naładowania × pojemność · kWh · szacunek, nie licznik energii · ${batteryAge}`;
    }
    return 'niedostępna — brak batteryAvailableEnergy i brak pewnej pojemności';
}

function capacityMeta(assessment: DrivingAssessment, cloudKwh: number | null): string {
    if (assessment.capacitySource === 'user') {
        const cloud = cloudKwh === null ? '' : ` Chmura podaje ${formatMeasure(cloudKwh, 1)} kWh.`;
        return `wpis użytkownika · kWh.${cloud}`;
    }
    if (assessment.capacitySource === 'cloud') return 'batteryCapacity z chmury · kWh. Może nie być pojemnością użyteczną.';
    if (assessment.capacityStatus === 'invalid') return 'wpis odrzucony. Brak zgadywania wersji baterii.';
    return 'nie podana. Procent na mecie wymaga pojemności.';
}

function Parameter({ label, value, meta }: { label: string; value: string; meta: string }): React.JSX.Element {
    return (
        <View style={styles.parameter}>
            <Text style={styles.rowLabel}>{label}</Text>
            <Text style={styles.rowValue}>{value}</Text>
            <Text style={styles.meta}>{meta}</Text>
        </View>
    );
}

function Field({ label, value, onChangeText, placeholder, testID }: {
    label: string;
    value: string;
    onChangeText: (text: string) => void;
    placeholder: string;
    testID: string;
}): React.JSX.Element {
    return (
        <View style={styles.field}>
            <Text style={styles.rowLabel}>{label}</Text>
            <TextInput
                testID={testID}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                keyboardType="decimal-pad"
                autoCorrect={false}
                style={styles.input}
            />
        </View>
    );
}

function Action({ label, onPress, testID, disabled = false }: {
    label: string;
    onPress: () => void;
    testID: string;
    disabled?: boolean;
}): React.JSX.Element {
    return (
        <Pressable testID={testID} onPress={onPress} disabled={disabled} style={[styles.action, disabled && styles.actionDisabled]}>
            <Text style={styles.actionText}>{label}</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    content: {
        paddingHorizontal: 20,
        paddingBottom: 48,
        gap: 8,
    },
    warning: {
        fontSize: 16,
        color: '#8A5A00',
    },
    banner: {
        fontSize: 16,
        color: '#8A5A00',
    },
    trend: {
        fontFamily: fontFamilyBold,
        fontWeight: fontWeightBold,
        fontSize: 56,
        marginTop: 8,
    },
    detail: {
        fontSize: 18,
    },
    section: {
        marginTop: 18,
        fontSize: 14,
        color: 'gray',
        textTransform: 'uppercase',
    },
    figure: {
        fontFamily: fontFamilyBold,
        fontWeight: fontWeightBold,
        fontSize: 42,
    },
    subfigure: {
        fontFamily: fontFamilyBold,
        fontWeight: fontWeightBold,
        fontSize: 28,
    },
    parameter: {
        gap: 2,
        marginTop: 8,
    },
    rowLabel: {
        fontSize: 14,
        color: 'gray',
    },
    rowValue: {
        fontSize: 22,
        fontFamily: fontFamilyBold,
        fontWeight: fontWeightBold,
    },
    meta: {
        fontSize: 14,
        color: 'gray',
    },
    field: {
        gap: 4,
        marginTop: 8,
    },
    input: {
        borderWidth: 1,
        borderColor: '#CACACA',
        borderRadius: 8,
        fontSize: 22,
        paddingHorizontal: 12,
        paddingVertical: 10,
        minHeight: 48,
    },
    actions: {
        gap: 8,
    },
    action: {
        minHeight: 48,
        borderRadius: 8,
        backgroundColor: '#1B1B1B',
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        marginTop: 8,
    },
    actionDisabled: {
        opacity: 0.5,
    },
    actionText: {
        color: 'white',
        fontSize: 16,
        fontFamily: fontFamilyBold,
        fontWeight: fontWeightBold,
    },
});

export default DrivingDashboardView;
