import Config from 'react-native-config';
import { BuildConfigReport, reportBuildConfig } from './buildConfigStatus';

/** Lecture du `.env` compilé dans l'app. Le rapport ne contient pas les valeurs. */
export function readBuildConfig(): BuildConfigReport {
    return reportBuildConfig({
        GIGYA_API_KEY: Config.GIGYA_API_KEY,
        KAMEREON_API_KEY: Config.KAMEREON_API_KEY,
        MAPS_API_KEY: Config.MAPS_API_KEY,
        WEATHER_API_KEY: Config.WEATHER_API_KEY,
        RTE_BASIC_AUTH: Config.RTE_BASIC_AUTH,
    });
}
