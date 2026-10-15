# Current acceptance: 7 October 2026

Six stations are deployed at https://pavoia.gaende.box.ca/ with English/German,
Plex catalogue metadata, cached covers and attributable portraits. The revised
frontend source is `web/`. Music files and tags remain unchanged.

Public six-station playback passed both ffmpeg decoding (three seconds per stream)
and Chromium playback/cover checks. EN/DE rendering passed at 320, 390, 760 and
1440 px. Evidence: `artifacts/six-stations-audio.json` and
`output/playwright/six-stations-browser-retry.log`. These are short functional
checks, not proof of uninterrupted long-duration audio or physical iPhone support.

Catalogue search and audience history were deployed with rollback and six
consistent SQLite backups under `artifacts/catalogue-ui-20261006T234740Z`.
Final public Chrome headless-shell 151.0.7922.34 checks passed search, pagination, empty results,
station/language changes without interrupting audio, late response rejection,
data failure/recovery and unknown-versus-zero statistics. Evidence:
`output/playwright/collection-browser-headless-shell.log`. Public current-track
artwork also loaded. Full Chromium/Chrome runtimes experienced native renderer
SIGTRAP crashes, including initial navigation. Removing list images and resizing
artwork did not establish a complete fix; the cause remains unknown. Final
catalogue rows are text-only, with artwork retained in the current-track section.
Thumbnail release: `artifacts/thumbnails-20261006T235735Z`. Final frontend release:
`artifacts/catalogue-text-20261007T000206Z`. All sampled public cover/portrait
images decoded and fit 640 by 640 pixels; see `artifacts/thumbnails-public.json`.
This thumbnail change uses Plex's existing image service, verified directly on
Whatbox and checked against the [PlexAPI client source](https://github.com/pushingkarmaorg/python-plexapi/blob/master/plexapi/server.py).

The two-station observer `observation-20261006T055230` was stopped for deployment:
2,100 samples, zero failed samples, incomplete 24-hour window. The new six-station
observer is `artifacts/observation-20261006T233838/`. Check its `summary.json` for
current results. It does not decode audio. All 13 containers were running after
expansion. Log caps total 76 MB: eleven at 4 MB, two preserved Palac Liquidsoap
containers at 16 MB. Future recreation applies the new 4 MB default.

Physical iPhone testing, mobile network changes, 100-listener public HTTPS capacity,
and Hermes enrichment remain unverified. The historical findings below retain
their original scope and are not evidence for the expanded frontend.

---

# Pavoia : recette du 6 octobre 2026

URL publique : https://pavoia.gaende.box.ca/ ; aucun mot de passe, conformément
à la demande de Yolan. App Whatbox `pavoia`, port 14500, WebSockets désactivés.
Le design reste celui du prototype d'écoute. Les scènes au-delà des deux Palac et le catalogue
explorable ne font pas partie du périmètre actuel.

## Validé

- Écoute sur ordinateur confirmée par Yolan : « lecture fluide ».
- Android réel : écoute avec écran verrouillé confirmée par Yolan. Modèle,
  navigateur et durée du test non précisés ; changement de réseau non confirmé.
- Chromium réel : lecture, pause libérant la connexion et reprise du direct.
  Un démarrage HTTPS mesuré à 1,959 seconde ; ce résultat ponctuel ne garantit
  pas le même délai sur chaque réseau. Reprise automatique après redémarrage
  ciblé de Liquidsoap également constatée.
- Synchronisation de 1 094 titres de la playlist Plex 146686. Musique montée
  en lecture seule ; services existants et autres tâches cron préservés.
- Tests Go avec détecteur de courses et analyse statique ; sept contrôles du
  lecteur, sept des opérations et quatre du test de charge. Configuration et
  callbacks exécutés avec le binaire Liquidsoap 2.4.5 épinglé, y compris la
  précision en millisecondes et les reprises après erreurs transitoires.
- Chaîne audio réelle sur sons générés et ports isolés : transitions décodées,
  continuité pendant 35 secondes d'indisponibilité du contrôleur, récupération
  des événements, arrêt après playlist vide, nouvelle playlist et démarrage
  depuis le cache lorsque le contrôleur refuse la connexion ou répond 503.
  Dernière exécution sur la configuration finale :
  `artifacts/audio-check-20261006T043717/result.json` sur Whatbox.

## Charge et exploitation

100 connexions HTTP locales maintenues pendant 900 secondes, sans erreur :
`artifacts/load-20261006T035540.json`. Cette preuve ne valide pas HTTPS public.

Le premier essai public HTTPS a échoué : deux connexions sur 100 ont échoué
dès leur ouverture, lors de l'arrivée groupée des 50 dernières connexions.
Les flux déjà établis ont continué ; le script a arrêté ses connexions en
détectant l'échec. Preuve conservée : `artifacts/load-20261006T042151.json`.
Le second essai, avec ouvertures espacées de 150 ms, échoue également : les
connexions numérotées 98 et 99 (base zéro) sont réinitialisées dès l'ouverture,
`ConnectionResetError`, errno 104, aucun octet reçu. Le compteur atteint 100,
soit 98 connexions de test et deux écoutes préexistantes. Preuve :
`artifacts/load-20261006T043614.json`. Un plafond sur le chemin HTTPS est une
hypothèse, pas une cause établie. Les 900 secondes publiques ne sont pas validées.
Ces connexions de recette comptent dans les statistiques du pilote, qui ne
doivent donc pas être interprétées comme une audience humaine.

Sauvegarde cohérente restaurée dans une base isolée : intégrité OK, 1 094 titres.
Preuve initiale de plafonnement des logs : `artifacts/log-cap-check.json`.
Après ajout de Dance, les cinq conteneurs sont effectivement configurés à
16 Mo chacun (inspection après recréation). Nginx n'écrit pas de logs persistants.
Entrée `@reboot` vérifiée, démarrage testé dans un environnement minimal.
La reprise après redémarrage physique de Whatbox n'a pas été provoquée.

## Lot à deux scènes

Palac Feel et Palac Dance sont déployées sur le même site, avec respectivement
1 094 et 1 625 titres synchronisés. Une base et un cache par scène ; les fichiers
audio restent montés en lecture seule. Les 18 événements Feel présents dans la
sauvegarde d'avant ce lot sont toujours présents après déploiement (23 au relevé).
Les deux sauvegardes synchronisées passent `integrity_check`.

- Go avec détecteur de courses et analyse statique : OK ; 12 tests du lecteur,
  10 tests des opérations, 4 du script de charge : OK. Liquidsoap 2.4.5 natif
  valide les deux configurations et la recette des callbacks. Relectures des
  trois tâches et relecture complète : aucune anomalie retenue.
- Recette audio isolée sur l'image finale :
  `artifacts/audio-check-20261006T053946/result.json`, tous les contrôles passent.
  Les deux flux HTTPS publics sont ensuite décodés sans erreur pendant six
  secondes chacun ; routes privées/inconnues 404, statistiques des deux scènes
  200. Preuve : `artifacts/two-scenes-public.json` sur Whatbox.
- Chromium réel : Feel puis Dance jouent avec un unique élément audio ; le
  compteur passe de Feel à Dance (0 et 1 au relevé). En pause, changer de scène
  conserve `paused=true` et aucune source audio. Les changements rapides
  Feel-Dance-Feel aboutissent à Feel, y compris le titre et Media Session.
  Une bascule supplémentaire mesurée à 633 ms, résultat ponctuel.
- Rendu vérifié à 1 440 px et 390 px, sans débordement horizontal ; captures dans
  `output/playwright/scenes-desktop.png` et `scenes-mobile.png`. Preuve locale :
  `artifacts/two-scenes-browser.json`. Le seul bruit console est le favicon
  absent, déjà présent sur le pilote initial.
- Pendant l'arrêt ciblé du moteur Dance, Feel reste présent et se décode sans
  erreur sur 18 secondes ; les deux sources sont présentes après redémarrage.
  Preuve : `artifacts/two-scenes-isolation.json`. Les sauvegardes et la
  conservation d'historique sont consignées dans `artifacts/two-scenes-backups.json`.

## En attente

- iOS réel : démarrage et écran verrouillé. Sur Android et iOS : changement
  de réseau et reprise. L'affichage étroit dans Chromium ne constitue pas
  un test mobile.
- Le suivi initial `artifacts/observation-20261006T035121/` a été interrompu
  volontairement lors du déploiement à deux scènes ; `termination.json` en
  conserve la raison. Il ne constitue pas une observation complète de 24 h.
  Un nouveau suivi des deux sources et API est démarré après les tests de
  redémarrage : `artifacts/observation-20261006T055230/`, début le 6 octobre
  à 05:52:30 UTC, fin attendue le 7 octobre à 16:52:30 en Nouvelle-Calédonie.
  Deux premiers échantillons sans échec ; intervalle encore incomplet.
  Échantillonnage local toutes les 30 secondes, sans décodage audio
  continu. Lire `complete` et `failedSamples` dans le nouveau `summary.json`
  avant toute conclusion.
- Le changement de scène sur un téléphone réel reste à confirmer ; l'essai
  Android écran verrouillé ci-dessus concernait la version à une seule scène.

## Limites connues

Le compteur mesure les connexions audio, pas les personnes uniques. Les heures
d'écoute sont estimées ; les trous de collecte restent inconnus. Jusqu'à 1 024
départs non acquittés sont conservés en mémoire dans Liquidsoap ; son arrêt
perd ces événements en attente. Le redémarrage des conteneurs est automatique,
mais Nginx n'a pas de superviseur continu : `python3 ops/manage.py boot` permet
de remettre les seuls services du pilote en marche après diagnostic.

Observation at 00:05 UTC on 7 October: 55 samples, one failed API read. The failure
occurred at 00:02:09 UTC on palac-feel during its targeted controller replacement;
its audio source remained present. All 13 containers and six audio sources were
running at the final service check. The 24-hour observation remains incomplete.

## Selection history: 7 October 2026, 00:15 UTC

Six baselines are live. New observed additions/removals are recorded atomically
with successful catalogue synchronization. Previous playlist edit dates are not
reconstructed. Public baseline checks passed on all six stations. Browser checks
confirmed real audio keeps playing when history is opened, with no page errors.
Evidence: `artifacts/history-public-api.json`,
`output/playwright/history-collection-public.log`,
`output/playwright/changes-browser-local.log` and remote rollback/verification
folder `artifacts/selection-history-20261007T001459Z`. The populated-history
screenshots contain browser-only fixtures, never production events.

## Full-library catalogue, 7 October 2026

- Public snapshot contains 90,536 tracks; radio selections contain 5,533 unique tracks.
- Search, pagination, snapshot age/count and English/German passed in headless-shell.
- Opening the full-library search preserved real audio playback.
- Failed refreshes retain the previous SQLite snapshot. A replacement becomes visible
  without restarting the controller. Snapshot files are private and API reads are read-only.
- Local metadata search took 8-51 ms in one run; public capacity is not inferred from this.
- Evidence: `artifacts/library-public-api.json`, `artifacts/library-local-api.json`,
  `output/playwright/library-public-browser.log`.


## Capacity and recovery, 7 October 2026

- 100 public streams opened without stream errors. The next HTTPS status request
  failed during TLS negotiation; the 15-minute hold remains unverified.
- The same failure occurred from the workstation while the seedbox held 100 streams.
- Temporary protection: 90 stream requests shared across all stations. A short real
  check confirmed working public APIs and HTTP 503 for the extra stream.
- All six daily backups restored successfully in disposable controllers. Database
  integrity, catalogue reads, retained counts and fallback reconstruction passed.
- Evidence: `artifacts/load-20261007T004757.json`, `artifacts/capacity-origin-probe.json`,
  `artifacts/capacity-guard-probe.json`, `artifacts/restore-check-20261007T004936Z.json`.

The 90-stream mitigation is not acceptance of the requested 100-listener target.
The exact managed HTTPS limit needs Whatbox confirmation; the support draft remains unsent.


Public gesture-to-playing startup measured 519-806 ms in one desktop headless-shell
sample per station. All six samples met the three-second target. Evidence:
`artifacts/start-latency-public.json` and `output/playwright/start-latency-public.log`.
This sample does not establish physical iPhone performance or mobile-network behavior.


## Isolated browser compatibility, 7 October 2026

Public functional checks passed in WebKit 26.6 with mobile emulation and full
Chrome for Testing 151.0.7922.34 inside an isolated Ubuntu runtime. Both verified
real audio, catalogue search, English/German, responsive widths, stale-response
handling and failure recovery. Startup was below three seconds in all six samples
per engine. The Linux-host Chromium crashes were not reproduced in this runtime;
their cause remains unconfirmed.

WebKit's native-select stylesheet warnings were reproduced without application
code. Controls remained functional and the site's security policy was retained.
Physical iPhone/background playback and network-change tests remain outstanding.
Evidence: `artifacts/browser-compatibility.json`; detailed logs and screenshots in
`output/playwright/webkit/` and `output/playwright/chromium-container/`.

## Fontanna, 7 October 2026

The seventh station is deployed with 660 playable tracks from Plex playlist
145469. Public status, catalogue, statistics and changes returned HTTP 200.
Five seconds of public MP3 decoded without error.

Chromium verified all seven station streams, Fontanna catalogue pagination,
English/German switching without stopping playback, and pause releasing audio.
No page errors or horizontal overflow occurred at widths 320, 390, 760 and
1440 pixels. Desktop and mobile screenshots were reviewed. All seven measured
starts were below one second; Fontanna took 492 ms in this single sample.
This is an automated browser check, not a physical mobile-device test.

Evidence: artifacts/fontanna-public.json, artifacts/fontanna-deployment.json,
output/playwright/fontanna/fontanna.log and output/playwright/fontanna/latency.log.
Local Go race/vet checks, 10 operations tests, 7 player tests and metadata export
checks passed. The full-library export now includes Fontanna: 5,909 unique radio
tracks across seven selections; the library still contains 90,536 tracks.
