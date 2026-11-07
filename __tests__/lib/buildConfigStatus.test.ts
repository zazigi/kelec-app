import { CarMaker } from "../../src/lib/clients/accounts/account";
import { configValueStatus, reportBuildConfig } from "../../src/lib/config/buildConfigStatus";
import { RENAULT_LOGIN_BLOCKED } from "../../src/packages/kelec-login/models/renaultConfigCopy";
import { RenaultLoginSource } from "../../src/packages/kelec-login/services/sources/renaultLoginSource";

jest.mock('react-native-config', () => {
    const config = {
        GIGYA_API_KEY: 'TO_FILL',
        KAMEREON_API_KEY: '',
        MAPS_API_KEY: 'TO_FILL',
        WEATHER_API_KEY: '',
        RTE_BASIC_AUTH: 'TO_FILL',
    };
    return { __esModule: true, default: config, Config: config };
});

test('TO_FILL et vide sont absents, une autre chaîne est présente, sans recopier la valeur', () => {
    expect(configValueStatus(undefined)).toBe('missing');
    expect(configValueStatus('  ')).toBe('missing');
    expect(configValueStatus('TO_FILL')).toBe('missing');
    expect(configValueStatus('to_fill')).toBe('missing');
    expect(configValueStatus('jest-present')).toBe('set');

    const report = reportBuildConfig({
        GIGYA_API_KEY: 'TO_FILL',
        KAMEREON_API_KEY: 'present-but-not-logged',
        MAPS_API_KEY: '',
        WEATHER_API_KEY: 'present-but-not-logged',
        RTE_BASIC_AUTH: 'TO_FILL',
    });
    expect(report).toEqual({
        renaultLogin: 'missing',
        missingRenault: ['GIGYA_API_KEY'],
        maps: 'missing',
        weather: 'set',
        rte: 'missing',
    });
    expect(JSON.stringify(report)).not.toContain('present-but-not-logged');
});

test('les deux clés Renault présentes : le login est marqué prêt, les autres services restent indépendants', () => {
    const report = reportBuildConfig({
        GIGYA_API_KEY: 'configured',
        KAMEREON_API_KEY: 'configured',
        MAPS_API_KEY: 'TO_FILL',
        WEATHER_API_KEY: '',
        RTE_BASIC_AUTH: '',
    });
    expect(report.renaultLogin).toBe('ready');
    expect(report.missingRenault).toEqual([]);
    expect(report.maps).toBe('missing');
});

test('connexion Renault refusée tant que les clés de compilation sont des placeholders', async () => {
    const result = await new RenaultLoginSource(CarMaker.RENAULT).authenticate('person@example.com', 'not-a-logged-secret');
    expect(result).toEqual({ status: 'error', messageKey: RENAULT_LOGIN_BLOCKED });
    expect(JSON.stringify(result)).not.toContain('not-a-logged-secret');
    expect(JSON.stringify(result)).not.toContain('TO_FILL');
});
