/**
 * État des variables de build, sans jamais renvoyer leur contenu.
 * `TO_FILL` est le texte de `.env.example`, pas une clé.
 */

export type ConfigPresence = 'set' | 'missing';

export type RenaultKeyName = 'GIGYA_API_KEY' | 'KAMEREON_API_KEY';

export type BuildConfigReport = {
    /** Les deux clés exigées par `RenaultClient` pour un compte Renault, Dacia ou Alpine. */
    renaultLogin: 'ready' | 'missing';
    missingRenault: RenaultKeyName[];
    /** Fond de carte Android. Inutile pour la connexion et pour la tablica jazdy. */
    maps: ConfigPresence;
    /** Pastille météo. Inutile pour la connexion. */
    weather: ConfigPresence;
    /** Widgets Tempo (RTE). Inutile pour la connexion. */
    rte: ConfigPresence;
};

export type BuildEnv = {
    GIGYA_API_KEY?: string;
    KAMEREON_API_KEY?: string;
    MAPS_API_KEY?: string;
    WEATHER_API_KEY?: string;
    RTE_BASIC_AUTH?: string;
};

export function configValueStatus(value: string | undefined | null): ConfigPresence {
    const trimmed = (value ?? '').trim();
    if (trimmed.length === 0 || trimmed.toUpperCase() === 'TO_FILL') return 'missing';
    return 'set';
}

export function reportBuildConfig(env: BuildEnv): BuildConfigReport {
    const missingRenault: RenaultKeyName[] = [];
    if (configValueStatus(env.GIGYA_API_KEY) === 'missing') missingRenault.push('GIGYA_API_KEY');
    if (configValueStatus(env.KAMEREON_API_KEY) === 'missing') missingRenault.push('KAMEREON_API_KEY');
    return {
        renaultLogin: missingRenault.length === 0 ? 'ready' : 'missing',
        missingRenault,
        maps: configValueStatus(env.MAPS_API_KEY),
        weather: configValueStatus(env.WEATHER_API_KEY),
        rte: configValueStatus(env.RTE_BASIC_AUTH),
    };
}
