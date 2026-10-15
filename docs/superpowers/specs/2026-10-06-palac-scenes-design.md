# Palac Feel et Palac Dance

Lot approuvé par Yolan : deux scènes, un seul lecteur, morceau et compteur
propres à la scène sélectionnée. Palac Feel utilise la playlist Plex 146686 ;
Palac Dance utilise 145470 (1 625 entrées lors de l'inventaire).

Le choix apparaît à côté du titre, sous forme d'un select natif libellé
« Scène ». En cours d'écoute, changer de scène libère immédiatement l'ancien
flux et rejoint le nouveau direct. En pause, ce choix ne lance pas la lecture.
Une ancienne réponse de métadonnées ou tentative de lecture ne peut remplacer
l'état de la nouvelle scène. Le titre de page et Media Session suivent le choix.

Chaque scène réutilise le même contrôleur Go et le même script Liquidsoap,
dans un processus distinct. SQLite, cache de secours et historique sont isolés
par répertoire. La base existante Palac Feel reste en place. Icecast et le point
d'entrée Nginx sont partagés. Ce choix évite une migration des données du pilote ;
il reste proportionné à deux scènes et sera réévalué avant une extension large.

Routes publiques : /api/radio/palac-feel, /api/radio/palac-dance, leurs /stats,
et /stream/<identifiant>.mp3. Les routes internes restent authentifiées et
accessibles uniquement sur les ports de boucle locale du contrôleur concerné.
Nginx sélectionne le contrôleur par route exacte ; toute scène inconnue répond 404.

Validation : isolation des playlists, compteurs, callbacks et statistiques ;
changement pendant lecture, pause, reconnexion et réponse API en retard ;
aucun second élément audio. Deux flux réels décodables et compteur revenant
sur l'autre scène lors du changement. L'écoute mobile réelle doit être
reconfirmée après modification du lecteur. Aucun fichier musical modifié.

Le test HTTPS à 100 connexions et la validation iPhone restent des limites
connues du lot précédent ; ce lot ne les déclare pas résolus. Aucun ajout de
framework, de scène supplémentaire ou de refonte graphique.
