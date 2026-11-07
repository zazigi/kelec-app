# Instalacja testowa na Androidzie (fork zazigi)

Ta kompilacja **nie loguje się do Renault**. Służy do obejrzenia tablicy jazdy na danych demonstracyjnych. Nie zastępuje odczytu z Renault 5.

## Czego brakuje do prawdziwego logowania

Aplikacja przy koncie Renault, Dacia albo Alpine wysyła dwa nagłówki klienta, wczytane z `.env` w czasie kompilacji:

| Zmienna | Do logowania Renault | Skąd, według tego repozytorium |
|---|---|---|
| `GIGYA_API_KEY` | tak | Brak instrukcji pobrania. W wydaniu Kelec wchodzi jako sekret GitHub `GIGYA_API_KEY` workflowu release właściciela `kelec-public`. Fork tego sekretu nie dziedziczy. |
| `KAMEREON_API_KEY` | tak | Tak samo: sekret `KAMEREON_API_KEY` wydania. W README nie ma adresu rejestracji. |
| `MAPS_API_KEY` | nie | Własny klucz Google Maps (Google Cloud), tylko tło mapy na Androidzie. |
| `WEATHER_API_KEY` | nie | Własny klucz weatherapi.com, tylko pogoda na mapie. |
| `RTE_BASIC_AUTH` | nie | Własne konto API RTE, Base64 `CLIENT_ID:CLIENT_SECRET`, tylko widgety Tempo. Portal: [data.rte-france.com](https://data.rte-france.com/catalog/-/api/consumption/Tempo-Like-Supply-Contract/v1.1). |

Hasło My Renault **nie zastępuje** tych dwóch kluczy. Aplikacja nie ma logowania OAuth, którego można by założyć samemu.

Portal [developer.renaultgroup.com](https://developer.renaultgroup.com/en/) opisuje aplikacje na system multimedialny auta (openR), nie konto My Renault używane przez Kelec. Nie wydaje kluczy, których ten kod oczekuje.

Nie wklejaj tu kluczy wyciągniętych z oficjalnej aplikacji ani z cudzej kompilacji. Nie wysyłaj haseł na czacie.

Żeby prawdziwe logowanie ruszyło, ktoś, kto legalnie dysponuje sekretami wydania Kelec, musi wstawić je do lokalnego `.env` (plik jest w `.gitignore`) i zbudować aplikację ponownie. Ten krok nie jest zrobiony.

## Ta paczka nie nadpisuje oficjalnego Kelec

Wariant `sidecar`:

- nazwa na pulpicie: **Kelec test**
- identyfikator: `com.myrenaultplus.sidecar`
- podpis: klucz debug tego repozytorium, nie klucz Play Store

Oficjalny Kelec to `com.myrenaultplus` z podpisem Play. Android potraktuje je jako dwie aplikacje. Wariant `debug` i `release` bez przyrostka nadal nazywa się `com.myrenaultplus` — tego pliku APK nie instaluj obok sklepowego Kelec.

Zegarek Wear OS oficjalnej aplikacji nie zsynchronizuje się z tą paczką: warstwa danych wymaga tego samego identyfikatora i tego samego podpisu.

## Konto demonstracyjne

W aplikacji, przy dowolnej marce:

- e-mail: `kelec-demo@gmail.com`
- hasło: `demo`

Trzy samochody są statyczne. Odświeżenie nie jedzie do Renault. Tablica jazdy na nich nie opisuje Twojej Renault 5.

## Instalacja na OnePlus 15

1. Zostaw oficjalny Kelec, jeśli jest ze Sklepu Play.
2. Zezwól na instalację z plików dla aplikacji, której używasz do otwarcia APK.
3. Zainstaluj `kelec-test-sidecar.apk` (arm64, około 81 MB). Pełny wynik Gradle ma też biblioteki emulatora; plik do telefonu jest przycięty skryptem `android/packageSidecarArm64.sh` i podpisany tym samym kluczem debug.
4. Otwórz **Kelec test**, zaloguj się kontem demonstracyjnym.
5. Nie oczekuj baterii ani licznika z auta.

Plik APK nie zawiera prawdziwych kluczy Renault, Google, pogody ani RTE. Mapa może być pusta. Logowanie Renault pokazuje komunikat o braku konfiguracji.
