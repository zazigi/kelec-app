# Package `kelec-driving` (fork personnel)

Installation Android de test, sans login Renault : [fork-android-setup.md](./fork-android-setup.md).

Tableau de conduite en polonais, ajouté dans le fork `zazigi/kelec-app`.
Œuvre dérivée de Kelec (`kelec-public/kelec-app`), sous **AGPL-3.0-or-later**, comme le reste du dépôt.
Les textes sont dans le package (`views/copy.ts`), pas dans `localizations.json` : ce fichier reste celui de l'application d'origine.

Pattern général : voir [packages-pattern.md](./packages-pattern.md).

## Ce que le cloud Renault fournit déjà

`RenaultClient` interroge Kamereon, pas un flux temps réel :

| Endpoint | Champs utilisés | Unité | Horodatage |
|---|---|---|---|
| `battery-status` v2 | `batteryLevel` | % | `timestamp` du véhicule |
| | `batteryAvailableEnergy` | kWh, seulement s'il est présent et ≥ 0 | même timestamp |
| | `batteryCapacity` | kWh, seulement si > 0 (0 = non fourni, comme la démo) | même timestamp |
| | `batteryAutonomy` | km, estimation constructeur | même timestamp |
| | `batteryTemperature` | °C | même timestamp |
| | `chargingStatus`, `plugStatus` | drapeaux | même timestamp |
| `cockpit` v1 | `totalMileage` | km | **aucun** dans la réponse typée |
| `location` v1 | latitude, longitude | degrés | `lastUpdateTime` |

L'écran ne crée pas d'appel supplémentaire tant que la page voiture est montée : il relit le handler déjà rempli.
Le bouton « Odśwież » relance le rafraîchissement existant. S'il est démonté (Android détache l'écran), le même couple battery-status + cockpit est rappelé **une fois**, au toucher, puis écrit dans les clés déjà utilisées (`<vin>/batteryStatus`, `<vin>/cockpitStatus`). Pas de minuteur.

## Ce qui manque pour un trend « style de conduite » en direct

Ces mesures ne sont pas dans les réponses déjà branchées. Elles ne sont pas inventées, et aucun PID OBD n'est deviné :

- puissance instantanée en roulant (kW) ;
- vitesse du véhicule (la position GPS n'est pas convertie en vitesse, ni en distance à vol d'oiseau) ;
- consommation du tableau de bord ;
- distance restante fournie par la navigation ;
- horodatage du kilométrage (`cockpit` n'en a pas).

Un relevé de plus de 20 minutes, sans timestamp, ou dont le timestamp batterie n'a pas bougé alors que le compteur a avancé, ne produit pas de consommation. Deux relevés valides au minimum sont nécessaires pour dire « mieux » ou « moins bien ». En dessous : échauffement ou données insuffisantes.

## Calcul retenu

- **Distance restante** : kilomètres de route saisis par l'utilisateur, diminués du delta de `totalMileage` depuis l'enregistrement. Jamais une ligne droite. Si le compteur manque au moment de la saisie, le nombre reste celui qui a été écrit et l'écran le dit.
- **Énergie** : `batteryAvailableEnergy` si le cloud le donne. Sinon % × capacité **saisie** (ou `batteryCapacity` si l'utilisateur n'a rien saisi et que la valeur est > 0). Aucune capacité de Renault 5 n'est codée en dur. Une capacité ≤ 0, non finie ou > 300 kWh est refusée et ne retombe pas en silence sur l'autre source.
- **Consommation mesurée** : ΔkWh / Δkm entre deux relevés dont le timestamp batterie avance, le compteur avance d'au moins 2 km, l'énergie baisse, la voiture ne charge pas, l'écart est ≤ 3 h, et les deux énergies ont la même source. Ce n'est pas du temps réel.
- **Tendance** : le dernier intervalle comparé à la moyenne des précédents (jusqu'à 5), bande relative de 5 %. Moins de kWh/km = réserve à l'arrivée qui augmente si ce rythme continue.
- **Arrivée** : énergie actuelle − distance restante × consommation. Négatif = injoignable. 0 km restant = l'énergie actuelle. Sans intervalle mesuré, un kWh/100 km saisi peut servir, étiqueté comme estimation manuelle. `batteryAutonomy` n'est jamais cette consommation.
- **Démo** : les mêmes formules sur les données statiques, avec un bandeau. Pas de trajet fictif prérempli.

Clés nouvelles, propres au package : `<vin>/drivingSamples`, `<vin>/drivingInputs`.

## Tests

`__tests__/packages/kelec-driving/drivingEstimate.test.ts` : amélioration, dégradation, arrêt, données insuffisantes / périmées / dans le désordre, distance nulle, capacité invalide, arrivée négative ou injoignable.
