import { Pressable, StyleSheet, useColorScheme, View } from "react-native";
import { useMemo } from "react";
import Text from "../../../screen/Common/CustomText";
import { getBlackColour, getGrayBackgroundColour } from "../../../lib/graphics/utils";
import { fontFamilyBold, fontWeightBold } from "../../../lib/graphics/commonStyle";
import { useDriving } from "../controllers/DrivingProvider";
import { evaluateDriving } from "../services/drivingEstimate";
import { COPY, routeSourceLabel, trendTitle } from "./copy";
import { formatMeasure } from "./format";

type Props = {
    readonly onPress: () => void;
};

function DrivingCard({ onPress }: Props): React.JSX.Element {
    const isDarkMode = useColorScheme() === 'dark';
    const { samples, inputs, current } = useDriving();
    const assessment = useMemo(
        () => evaluateDriving(samples, inputs, current, Date.now()),
        [samples, inputs, current],
    );
    const remaining = assessment.remainingRouteKm === null
        ? 'brak trasy'
        : `${formatMeasure(assessment.remainingRouteKm, 1)} km`;

    return (
        <Pressable
            testID="drivingCard"
            onPress={onPress}
            style={[styles.card, { backgroundColor: getGrayBackgroundColour(isDarkMode) }]}
        >
            <View style={styles.row}>
                <Text style={[styles.title, { color: getBlackColour(isDarkMode) }]}>{COPY.open}</Text>
                <Text style={[styles.trend, { color: getBlackColour(isDarkMode) }]} testID="drivingCardTrend">
                    {trendTitle(assessment.trend)}
                </Text>
            </View>
            <Text style={styles.meta}>
                {remaining} · {routeSourceLabel(assessment.routeSource)}
            </Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    card: {
        marginHorizontal: 15,
        borderRadius: 7,
        padding: 15,
        gap: 6,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
    },
    title: {
        fontFamily: fontFamilyBold,
        fontWeight: fontWeightBold,
        fontSize: 20,
    },
    trend: {
        fontFamily: fontFamilyBold,
        fontWeight: fontWeightBold,
        fontSize: 20,
    },
    meta: {
        color: 'gray',
        fontSize: 14,
    },
});

export default DrivingCard;
