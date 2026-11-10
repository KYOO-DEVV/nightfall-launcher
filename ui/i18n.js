/* global nf, lib, $ */
// French translation. The interface is written in English; when French is on, every text that appears on screen
// is swapped for its French version as it's drawn (exact sentences first, then patterns for sentences with numbers).
/* eslint-disable quotes */
(() => {
const D = {
  // navigation & common
  'Home': 'Accueil', 'Library': 'Bibliothèque', 'News': 'Actualités', 'Profile': 'Profil', 'Settings': 'Paramètres', 'Downloads': 'Téléchargements',
  'Search': 'Rechercher', 'Add a game': 'Ajouter un jeu', 'Navigation': 'Navigation', 'Minimize': 'Réduire', 'Maximize': 'Agrandir', 'Close': 'Fermer',
  'Back': 'Retour', 'Continue': 'Continuer', 'Skip': 'Passer', 'Save': 'Enregistrer', 'Create': 'Créer', 'Change': 'Modifier', 'Reset': 'Réinitialiser',
  'Refresh': 'Actualiser', 'Install': 'Installer', 'Play': 'Jouer', 'Open': 'Ouvrir', 'Got it': "C'est noté", 'On': 'Activé', 'Off': 'Désactivé',
  'None': 'Aucune', 'System': 'Système', 'Automatic': 'Automatique', 'Error': 'Erreur', 'New': 'Nouveau', 'Hidden': 'Masqués', 'All': 'Tous',
  'Share': 'Partager', 'Sort': 'Trier', 'Grid': 'Grille', 'List': 'Liste', 'Cover size': 'Taille des jaquettes', 'Name': 'Nom', 'Bio': 'Bio',
  'Search your library': 'Rechercher dans ta bibliothèque', 'Search your games': 'Rechercher tes jeux', 'No games match that name.': 'Aucun jeu ne porte ce nom.',
  'Your library is empty.': 'Ta bibliothèque est vide.', 'Saved': 'Enregistré', 'Something went wrong.': "Un problème est survenu.",
  'Offline · showing your saved library': 'Hors ligne · bibliothèque enregistrée affichée', 'Back online': 'De nouveau en ligne',
  'Drop to add': 'Dépose pour ajouter', '.exe or shortcut files': 'Fichiers .exe ou raccourcis', 'Playing': 'En jeu', 'Running': 'En cours', 'Launching…': 'Lancement…',
  'Update now': 'Mettre à jour',
  // home
  'Good morning': 'Bonjour', 'Good afternoon': 'Bon après-midi', 'Good evening': 'Bonsoir', 'Late night session': 'Session de nuit',
  'Year in review': 'Bilan de l\'année', 'Connect All': 'Tout connecter', 'Connect your games': 'Connecte tes jeux',
  'Connect All looks through the launchers on this PC for installed games, then adds them with their official artwork and starts tracking your play time. You choose what gets added.':
    "Tout connecter cherche les jeux installés dans les launchers de ce PC, les ajoute avec leurs visuels officiels et commence à suivre ton temps de jeu. Tu choisis ce qui est ajouté.",
  "or drop any game's .exe into this window": "ou dépose le .exe d'un jeu dans cette fenêtre", 'Friends': 'Amis', 'This week': 'Cette semaine',
  'Sessions': 'Sessions', 'Games': 'Jeux', 'Game': 'Jeu', 'Avg.': 'Moy.', 'Shots': 'Captures', 'Most played': 'Les plus joués', 'All time': 'Depuis toujours',
  'Recently played': 'Joués récemment', 'Bookmarks': 'Favoris', 'Recently added': 'Ajoutés récemment', 'From your stores': 'De tes stores',
  'Games you play show up here, even when you start them from Steam or a desktop shortcut.': 'Les jeux auxquels tu joues apparaissent ici, même lancés depuis Steam ou un raccourci.',
  'Bookmark a game on its page and it shows up here.': 'Ajoute un jeu aux favoris depuis sa page et il apparaîtra ici.', 'No games yet.': 'Aucun jeu pour le moment.',
  'Play more games and they show up here.': 'Joue à plus de jeux et ils apparaîtront ici.', 'Ready to play': 'Prêt à jouer', 'Continue ': 'Continuer',
  'Sign in to the Steam app on this PC and your friends show up here.': "Connecte-toi à l'appli Steam sur ce PC et tes amis apparaîtront ici.",
  'No friends in your Steam app yet.': "Aucun ami dans ton appli Steam pour l'instant.", 'No Steam friends yet.': "Aucun ami Steam pour l'instant.",
  'In a game': 'En jeu', 'Offline': 'Hors ligne', 'Online': 'En ligne', 'Away': 'Absent', 'Busy': 'Occupé', 'Snooze': 'Inactif', 'Nothing connected yet.': "Rien n'est encore connecté.",
  'Play a game for at least 30 seconds and it shows up here.': 'Joue au moins 30 secondes à un jeu et il apparaîtra ici.',
  'right now ·': 'en ce moment ·', 'games ·': 'jeux ·', 'game ·': 'jeu ·', 'games.': 'jeux.', 'game.': 'jeu.', 'this week.': 'cette semaine.', 'played this week across': 'joués cette semaine sur',
  // game page
  'Total played': 'Temps total', 'On Steam': 'Sur Steam', 'Achievements': 'Succès', 'Matches': 'Parties', 'Screenshots': 'Captures',
  'Play history': 'Historique', 'Recent sessions': 'Sessions récentes', 'Experiences': 'Expériences', 'Experiences you played': 'Expériences jouées',
  'Bookmark': 'Ajouter aux favoris', 'Remove bookmark': 'Retirer des favoris', 'Pin to sidebar': 'Épingler dans la barre', 'Unpin from sidebar': 'Désépingler',
  'Share stats card': 'Partager une carte de stats', 'Game settings': 'Paramètres du jeu', 'Total': 'Total', 'Average': 'Moyenne', 'Longest': 'La plus longue',
  'No sessions yet. Play it and they show up here.': "Aucune session pour l'instant. Joue et elles apparaîtront ici.", 'Playing now': 'En jeu',
  'Finding official artwork…': 'Recherche des visuels officiels…', 'Offline · artwork loads when you reconnect': 'Hors ligne · les visuels arriveront à la reconnexion',
  'No artwork found · pick it in Game settings': 'Aucun visuel trouvé · choisis-le dans les paramètres du jeu', 'Bookmark removed': 'Retiré des favoris',
  'Unpinned from the sidebar': 'Désépinglé de la barre', 'Hidden achievement': 'Succès caché', 'Keep playing to find out': 'Continue à jouer pour le découvrir',
  'Unlocked': 'Débloqué', 'Banner': 'Bannière', 'New character': 'Nouveau personnage', 'Update': 'Mise à jour', 'Event': 'Événement', 'Notice': 'Annonce',
  // store page & downloads
  'About': 'À propos', 'Store page': 'Page du store', 'Developer': 'Développeur', 'Publisher': 'Éditeur', 'Released': 'Sortie', 'Genres': 'Genres',
  'Price': 'Prix', 'Free to play': 'Gratuit', 'Disk space': 'Espace disque', 'Steam play time': 'Temps sur Steam', 'Last played': 'Dernière partie',
  'No screenshots available.': 'Aucune capture disponible.', 'Downloading': 'Téléchargement', 'Installing': 'Installation', 'Paused': 'En pause', 'Queued': 'En attente',
  'Installing…': 'Installation…', 'Nothing downloading': 'Aucun téléchargement', 'Open Steam downloads': 'Ouvrir les téléchargements Steam',
  'No downloads right now': 'Aucun téléchargement en cours', 'Install a game from Library → Your stores and its progress shows here.': 'Installe un jeu depuis Bibliothèque → Tes stores et sa progression s\'affichera ici.',
  'Speed': 'Vitesse', 'Peak': 'Pic', 'Time left': 'Temps restant', 'Drive': 'Disque', 'Download': 'Téléchargement', 'Update ': 'Mise à jour',
  'Measuring speed…': 'Mesure de la vitesse…', 'No data moving in the last 2 minutes': 'Aucun transfert depuis 2 minutes',
  // library
  'On this PC': 'Sur ce PC', 'Your stores': 'Tes stores', 'Your games': 'Tes jeux', 'Installed': 'Installés', 'Not installed': 'Non installé',
  'Recently played ': 'Joués récemment', 'Most played ': 'Les plus joués', 'Recently added ': 'Ajoutés récemment', 'Not played yet': 'Pas encore joué',
  'No games match.': 'Aucun jeu ne correspond.', 'Bookmark a game on its page to add it here.': 'Ajoute un jeu aux favoris depuis sa page pour le voir ici.',
  'This collection is empty. Add games from their Game settings.': 'Cette collection est vide. Ajoute des jeux depuis leurs paramètres.',
  'Reading your store libraries…': 'Lecture de tes stores…', 'Back to all games': 'Revenir à tous les jeux', '+ New collection': '+ Nouvelle collection',
  'Collection name, then Enter': 'Nom de la collection, puis Entrée', 'Collection created · add games from their settings': 'Collection créée · ajoute des jeux depuis leurs paramètres',
  "Couldn't read your store libraries": 'Impossible de lire tes stores', 'Try again': 'Réessayer',
  "Your stores' apps may be busy updating. Your games on this PC are not affected.": 'Les applis de tes stores sont peut-être en train de se mettre à jour. Tes jeux sur ce PC ne sont pas concernés.',
  'No store libraries found on this PC. Sign in to Steam, Epic, GOG Galaxy, Amazon Games or itch once, then refresh.': 'Aucun store trouvé sur ce PC. Connecte-toi une fois à Steam, Epic, GOG Galaxy, Amazon Games ou itch, puis actualise.',
  'Other launchers': 'Autres launchers', 'Added by you': 'Ajouté par toi',
  // news
  'For the games you play': 'Pour les jeux auxquels tu joues', 'Latest': 'Dernières', 'Coming up': 'À venir', 'No news yet': "Pas encore d'actualités",
  'News shows up for HoYoverse games, Fortnite, Valorant, League of Legends and Steam games in your library.': "Les actualités s'affichent pour les jeux HoYoverse, Fortnite, Valorant, League of Legends et les jeux Steam de ta bibliothèque.",
  'Gathering news for your games…': 'Récupération des actualités…',
  // profile
  'Change banner': 'Changer la bannière', 'Add a banner': 'Ajouter une bannière', 'Change profile picture': 'Changer la photo de profil', 'Reset picture': 'Réinitialiser la photo',
  "Add a short bio, e.g. what you're playing these days": 'Ajoute une courte bio, par exemple ce à quoi tu joues en ce moment', 'Showcase': 'Vitrine', 'Choose games': 'Choisir des jeux',
  'Played in Nightfall': 'Joué dans Nightfall', 'This year': 'Cette année', 'Bookmarked': 'En favoris', 'Name saved': 'Nom enregistré', 'Bio saved': 'Bio enregistrée',
  'Profile picture updated': 'Photo de profil mise à jour', 'Banner updated': 'Bannière mise à jour', 'Your showcase holds 12 games': 'Ta vitrine contient 12 jeux maximum', 'Showcase saved': 'Vitrine enregistrée',
  'Show off the games you love. Pick up to 12 and they appear here, in your order.': "Montre les jeux que tu aimes. Choisis-en jusqu'à 12, ils apparaîtront ici dans ton ordre.",
  'Pick up to 12 games for your profile, in the order you click them.': "Choisis jusqu'à 12 jeux pour ton profil, dans l'ordre où tu cliques.",
  // game settings modal
  'Tracked process': 'Processus suivi', 'Artwork': 'Visuels', 'Search Steam for this game': 'Chercher ce jeu sur Steam', 'Use my own cover': 'Utiliser ma jaquette',
  'Use my own background': 'Utiliser mon fond', 'Use my own logo': 'Utiliser mon logo', 'Fetch art again': 'Récupérer les visuels', 'Pinned games get a shortcut in the left bar.': 'Les jeux épinglés ont un raccourci dans la barre de gauche.',
  'Collections': 'Collections', 'No collections yet. Create one below.': 'Aucune collection. Crées-en une ci-dessous.', 'New collection, e.g. Co-op with friends': 'Nouvelle collection, par ex. Coop entre amis',
  'Show file': 'Afficher le fichier', 'Remove from library': 'Retirer de la bibliothèque', 'Click again to remove (play history is deleted)': "Clique encore pour retirer (l'historique sera supprimé)",
  'Play time counts while this process is running. If the game starts through a separate launcher, put the real game\'s .exe name here (separate several with commas).': "Le temps de jeu compte tant que ce processus tourne. Si le jeu passe par un launcher, indique ici le nom du vrai .exe du jeu (sépare-les par des virgules).",
  'Launch options': 'Options de lancement', 'Extra arguments, e.g. -windowed -novid': 'Arguments supplémentaires, par ex. -windowed -novid',
  "Used when Nightfall starts the game's .exe itself (not through Steam or another launcher).": 'Utilisés quand Nightfall lance lui-même le .exe du jeu (pas via Steam ou un autre launcher).',
  'Run as administrator': 'Exécuter en administrateur', 'Windows asks for permission each time.': "Windows demande l'autorisation à chaque fois.",
  'Hide Nightfall when the game starts': 'Masquer Nightfall au lancement du jeu', 'It keeps tracking from the tray.': 'Il continue le suivi depuis la zone de notification.',
  'Daily limit': 'Limite quotidienne', "A gentle reminder once you've played this long in a day.": 'Un petit rappel quand tu as joué autant dans la journée.',
  'Hide from library': 'Masquer de la bibliothèque', 'Kept with its play time. Find it again under Library → Hidden.': 'Conservé avec son temps de jeu. Retrouve-le dans Bibliothèque → Masqués.',
  "You'll get a reminder once you reach it each day": "Tu recevras un rappel chaque jour quand tu l'atteins", 'Session timer off': 'Chrono de session désactivé',
  'The timer appears in the corner next time a game runs': 'Le chrono apparaîtra dans le coin au prochain jeu lancé',
  'Searching Steam…': 'Recherche sur Steam…', 'Could not reach Steam. Check your connection and try again.': 'Steam est injoignable. Vérifie ta connexion et réessaie.',
  'No matches. Try a shorter name, or use your own images below.': 'Aucun résultat. Essaie un nom plus court ou utilise tes propres images.',
  'Artwork updated': 'Visuels mis à jour', 'Fetching artwork…': 'Récupération des visuels…',
  // connect all
  'Looking for games on this PC': 'Recherche des jeux sur ce PC', 'Select none': 'Tout décocher', 'Select all': 'Tout cocher', 'Scan again': 'Relancer la recherche',
  'Connect': 'Connecter', 'Nothing selected': 'Rien de sélectionné', 'Those games are already connected': 'Ces jeux sont déjà connectés', 'Connected': 'Connecté',
  'No installed games found': 'Aucun jeu installé trouvé', 'The scan stopped early': "La recherche s'est arrêtée",
  // share
  'Copy image': "Copier l'image", 'Save as PNG': 'Enregistrer en PNG', 'Post it on Discord, Instagram or anywhere.': 'Publie-la sur Discord, Instagram ou ailleurs.',
  'Copied · paste it into Discord or anywhere': "Copiée · colle-la sur Discord ou ailleurs", "Couldn't copy here. Use Save as PNG instead.": 'Copie impossible ici. Utilise plutôt Enregistrer en PNG.',
  // settings
  'Accounts': 'Comptes', 'Appearance': 'Apparence', 'Notifications': 'Notifications', 'Accessibility': 'Accessibilité', 'Backups': 'Sauvegardes',
  'Updates': 'Mises à jour', 'Help & privacy': 'Aide et confidentialité', 'Startup': 'Démarrage', 'Discord': 'Discord',
  "Nightfall finds the stores signed in on this PC by itself. There's nothing to log in to.": "Nightfall trouve tout seul les stores connectés sur ce PC. Rien à saisir.",
  'Add newly installed games automatically': 'Ajouter automatiquement les nouveaux jeux', 'Steam and Epic games you install show up in your library by themselves.': 'Les jeux Steam et Epic que tu installes arrivent tout seuls dans ta bibliothèque.',
  'Steam friends': 'Amis Steam', 'Advanced: use a Steam Web API key': 'Avancé : utiliser une clé API Steam Web', 'Get a key': 'Obtenir une clé', 'Steam Web API key': 'Clé API Steam Web',
  "Optional. Friends already work without it. A key reads the list straight from Steam's servers, which is faster with a lot of friends.": "Facultatif. Les amis fonctionnent déjà sans. Une clé lit la liste directement sur les serveurs de Steam, plus rapide avec beaucoup d'amis.",
  'Not available': 'Indisponible', 'Sign in to the Steam app on this PC to see your friends.': "Connecte-toi à l'appli Steam sur ce PC pour voir tes amis.",
  'No friends found in your Steam app yet.': "Aucun ami trouvé dans ton appli Steam pour l'instant.", 'found automatically': 'trouvé automatiquement',
  'How your games are shown.': "L'affichage de tes jeux.", 'Show filters in the library': 'Afficher les filtres dans la bibliothèque', 'Bookmarks, collections and store chips above your games.': 'Favoris, collections et stores au-dessus de tes jeux.',
  'Game settings icon': "Icône des paramètres du jeu", 'On game cards and game pages. With "None", right-click a card to open its settings.': 'Sur les cartes et les pages de jeu. Avec « Aucune », fais un clic droit sur une carte pour ouvrir ses paramètres.',
  'Gear': 'Engrenage', 'Sliders': 'Curseurs', 'Pencil': 'Crayon', 'Dots': 'Points',
  'Show the game you\'re playing on your Discord profile.': 'Affiche le jeu en cours sur ton profil Discord.', 'Rich Presence': 'Rich Presence', 'Discord Application ID': "ID d'application Discord",
  'Send a test': 'Envoyer un test', 'Developer portal': 'Portail développeur', 'Show "In Nightfall" when not playing': 'Afficher « Dans Nightfall » hors jeu', "Lets friends see you're picking a game.": 'Tes amis voient que tu choisis un jeu.',
  'Add your Discord Application ID below to turn it on.': "Ajoute ton ID d'application Discord ci-dessous pour l'activer.", 'Waiting for Discord. Make sure the Discord desktop app is open.': "En attente de Discord. Vérifie que l'appli Discord est ouverte.",
  'Connected to Discord': 'Connecté à Discord', 'Discord Application ID saved': "ID d'application Discord enregistré", 'Test sent. Check your Discord profile in the next 20 seconds': 'Test envoyé. Regarde ton profil Discord dans les 20 secondes',
  'Keep tracking reliable.': 'Pour un suivi fiable.', 'Start with Windows': 'Lancer avec Windows', 'Opens hidden in the tray so tracking never misses a session.': "S'ouvre discrètement dans la zone de notification pour ne rater aucune session.",
  'Keep tracking when the window is closed': 'Continuer le suivi fenêtre fermée', 'Closing hides Nightfall to the tray instead of quitting.': 'Fermer masque Nightfall dans la zone de notification au lieu de le quitter.',
  'Colours and language.': 'Couleurs et langue.', 'Accent colour': "Couleur d'accent", 'Buttons, toggles and highlights.': 'Boutons, interrupteurs et éléments actifs.',
  'Language': 'Langue', '"Automatic" follows Windows.': '« Automatique » suit Windows.', 'White': 'Blanc', 'Violet': 'Violet', 'Blue': 'Bleu', 'Green': 'Vert', 'Pink': 'Rose', 'Orange': 'Orange',
  'Windows notifications, only for things worth knowing.': "Notifications Windows, seulement pour l'essentiel.", 'Download finished': 'Téléchargement terminé',
  'When a game from your stores is ready to play.': "Quand un jeu de tes stores est prêt.", 'Weekly recap': 'Récap de la semaine', 'On Monday: how much you played last week, and what.': 'Le lundi : combien et à quoi tu as joué la semaine passée.',
  'Session timer': 'Chrono de session', 'A small window in the corner with the time spent in the current game. Shows over borderless and windowed games.': "Une petite fenêtre dans le coin avec le temps passé dans le jeu en cours. Visible au-dessus des jeux en fenêtré et en plein écran fenêtré.",
  'Daily limits are set per game, in its Game settings.': 'Les limites quotidiennes se règlent par jeu, dans ses paramètres.',
  'Motion, keyboard and controller.': 'Animations, clavier et manette.', 'Reduce motion': 'Réduire les animations', 'Turns off sliding, zooming and fading. "System" follows Windows\' animation setting.': 'Désactive les glissements, zooms et fondus. « Système » suit le réglage d\'animations de Windows.',
  'Launch sound': 'Son de lancement', 'A soft chime when a game starts.': "Un petit son quand un jeu démarre.", 'Keyboard shortcuts': 'Raccourcis clavier', 'Show shortcuts': 'Voir les raccourcis',
  'Everything works without a mouse. Press': 'Tout fonctionne sans souris. Appuie sur', 'anywhere to see the shortcuts.': "n'importe où pour voir les raccourcis.",
  'Controller': 'Manette', 'Plug in or turn on a controller and press any button.': "Branche ou allume une manette et appuie sur un bouton.", 'Not connected': 'Non connectée',
  'Your library and play history are saved once a day, and the last 10 copies are kept.': 'Ta bibliothèque et ton historique sont sauvegardés une fois par jour, les 10 dernières copies sont gardées.',
  'Back up now': 'Sauvegarder maintenant', 'Restore': 'Restaurer', 'Click again to restore': 'Clique encore pour restaurer', 'Backup saved': 'Sauvegarde effectuée',
  "Couldn't save a backup": 'Sauvegarde impossible', 'No backups yet. The first one is made today.': "Aucune sauvegarde. La première sera faite aujourd'hui.",
  'Backup restored · what you had before was saved as a backup too': 'Sauvegarde restaurée · ton état précédent a aussi été sauvegardé',
  'Signed updates from GitHub, installed in one click.': 'Mises à jour signées depuis GitHub, installées en un clic.', 'Check now': 'Vérifier', "What's new": 'Nouveautés',
  'Everything that changed in recent versions.': 'Tout ce qui a changé dans les dernières versions.', "See what's new": 'Voir les nouveautés',
  'Updates are off in development builds.': 'Mises à jour désactivées en version de développement.', 'Checking for updates…': 'Recherche de mises à jour…',
  "You're on the latest version.": 'Tu as la dernière version.', "You're on the latest version": 'Tu as la dernière version', "Couldn't check for updates. Try again later.": 'Vérification impossible. Réessaie plus tard.',
  'Checks automatically every 6 hours.': 'Vérifie automatiquement toutes les 6 heures.', 'Checking…': 'Vérification…',
  'Something not working? Tell us in two clicks.': 'Un souci ? Dis-le-nous en deux clics.', 'Report a problem': 'Signaler un problème',
  'What happened, and what did you expect? (optional)': "Que s'est-il passé, et qu'attendais-tu ? (facultatif)", 'Create a report': 'Créer un rapport',
  'Open an issue on GitHub': 'Ouvrir un ticket sur GitHub', 'Log folder': 'Dossier des journaux',
  "The report is a text file saved to your Downloads folder. It has Nightfall's version, your Windows version, which stores were found and the recent log, and never your files, passwords or Windows user name. Nothing is sent unless you attach it yourself.":
    "Le rapport est un fichier texte enregistré dans tes Téléchargements. Il contient la version de Nightfall, ta version de Windows, les stores trouvés et le journal récent, jamais tes fichiers, mots de passe ni ton nom d'utilisateur Windows. Rien n'est envoyé sauf si tu le joins toi-même.",
  'Welcome tour': "Visite d'accueil", 'See the first-run setup again.': 'Revoir la configuration du premier lancement.', 'Start the tour': 'Lancer la visite',
  'Your data stays on this PC': 'Tes données restent sur ce PC',
  'Nightfall has no account, no analytics and no tracking. Your library, play time and profile are stored only in your Windows user folder. It connects to the internet only to fetch artwork, news, store details and updates.':
    "Nightfall n'a ni compte, ni statistiques d'usage, ni pistage. Ta bibliothèque, ton temps de jeu et ton profil sont stockés uniquement dans ton dossier Windows. Il ne se connecte à internet que pour récupérer visuels, actualités, infos des stores et mises à jour.",
  'Privacy policy': 'Politique de confidentialité', 'The full version, in plain words.': 'La version complète, en termes simples.', 'Read it': 'La lire',
  // shortcuts
  'Shortcuts': 'Raccourcis', 'Go to': 'Aller à', 'Actions': 'Actions', 'Moving around': 'Se déplacer', 'Play the game on screen': 'Jouer au jeu affiché', 'This list': 'Cette liste',
  'Move between games and buttons': 'Passer de jeu en jeu et de bouton en bouton', 'Next control': 'Élément suivant', 'Move': 'Se déplacer', 'Open / press': 'Ouvrir / appuyer',
  'Back / close': 'Retour / fermer', 'Switch page': 'Changer de page', 'Search your games ': 'Rechercher tes jeux', 'Controller disconnected': 'Manette déconnectée',
  'Open ': 'Ouvrir', 'Pages': 'Pages',
  // welcome
  'Welcome to Nightfall': 'Bienvenue dans Nightfall', "Every game on your PC in one place, with its official artwork and the time you really spend playing. Let's set it up.": "Tous les jeux de ton PC au même endroit, avec leurs visuels officiels et ton vrai temps de jeu. On s'installe ?",
  'Looking for your games…': 'Recherche de tes jeux…', 'Steam, Epic Games, GOG, Ubisoft, Riot, HoYoPlay, EA, Xbox, Minecraft and more': 'Steam, Epic Games, GOG, Ubisoft, Riot, HoYoPlay, EA, Xbox, Minecraft et plus',
  'No games found yet': "Aucun jeu trouvé pour l'instant", 'You can add any game later by dropping its .exe into the window.': "Tu pourras ajouter n'importe quel jeu en déposant son .exe dans la fenêtre.",
  'Make it yours': 'À ta façon', 'You can change all of this later in Settings.': 'Tu pourras tout changer plus tard dans les Paramètres.',
  'Add new games automatically': 'Ajouter les nouveaux jeux automatiquement', 'Steam and Epic games you install join your library by themselves.': 'Les jeux Steam et Epic que tu installes rejoignent ta bibliothèque tout seuls.',
  'Opens quietly in the tray so no play session is missed.': "S'ouvre discrètement pour ne rater aucune session.", 'Keep tracking when closed': 'Continuer le suivi fenêtre fermée',
  'Closing the window hides Nightfall to the tray.': 'Fermer la fenêtre masque Nightfall dans la zone de notification.', 'Your profile': 'Ton profil',
  'Only you see it, unless you share a stats card.': 'Toi seul le vois, sauf si tu partages une carte de stats.', 'Start playing': "C'est parti",
  'Your picture comes from Steam. Click it to use another one.': 'Ta photo vient de Steam. Clique dessus pour en choisir une autre.', 'Click the circle to add a picture.': 'Clique sur le cadre pour ajouter une photo.',
  'Choose a picture': 'Choisir une photo',
  // what's new
  'See earlier versions': 'Voir les versions précédentes', 'November 2026': 'Novembre 2026', 'Your games, your way': 'Tes jeux, à ta façon', 'Built to be relied on': 'Fait pour être fiable',
  'Each game page takes the colour of its artwork.': 'Chaque page de jeu prend la couleur de ses visuels.',
  'The Play button shows the game starting, then a live session timer.': 'Le bouton Jouer montre le lancement, puis un chrono de session en direct.',
  'Steam achievements on game pages, read from your PC with no account needed.': 'Les succès Steam sur les pages de jeu, lus depuis ton PC, sans compte.',
  'Screenshots for each game, from Steam, Xbox Game Bar and NVIDIA.': 'Les captures de chaque jeu, depuis Steam, la Xbox Game Bar et NVIDIA.',
  'Launch options per game: extra arguments, run as administrator, hide Nightfall when the game starts.': 'Options de lancement par jeu : arguments, exécution en administrateur, Nightfall masqué au lancement.',
  'Daily limits per game with a gentle reminder, and a weekly recap every Monday.': 'Limites quotidiennes par jeu avec un petit rappel, et un récap chaque lundi.',
  'A Windows notification and a flash on the cover when a download finishes.': 'Une notification Windows et un éclat sur la jaquette quand un téléchargement se termine.',
  'Library in grid or list view, adjustable cover size, a New badge, hidden games and drag-to-reorder pinned games.': 'Bibliothèque en grille ou en liste, taille des jaquettes réglable, badge Nouveau, jeux masqués et jeux épinglés à réorganiser par glisser-déposer.',
  'Accent colours and a full French translation.': "Couleurs d'accent et traduction française complète.",
  'Your stores open instantly, and an optional session timer stays on top of your game.': "Tes stores s'ouvrent instantanément, et un chrono de session optionnel reste au-dessus de ton jeu.",
  'A welcome tour the first time you open Nightfall: it finds your games, sets things up and creates your profile in under a minute.': "Une visite d'accueil au premier lancement : elle trouve tes jeux, règle l'essentiel et crée ton profil en moins d'une minute.",
  'This page: see what changed after every update.': 'Cette page : ce qui a changé après chaque mise à jour.',
  'Your library is backed up every day (10 copies kept) and can be restored from Settings → Backups. A damaged library file is repaired from the newest backup by itself.': 'Ta bibliothèque est sauvegardée chaque jour (10 copies gardées) et se restaure depuis Paramètres → Sauvegardes. Un fichier abîmé est réparé tout seul depuis la dernière sauvegarde.',
  'Report a problem in two clicks from Settings → Help: a plain-text report with no personal data, ready to attach to a GitHub issue.': 'Signale un problème en deux clics depuis Paramètres → Aide : un rapport texte sans données personnelles, prêt à joindre à un ticket GitHub.',
  'Full keyboard control (press ? for the shortcuts) and controller support: move with the D-pad, A to open, B to go back, LB / RB to switch pages.': 'Contrôle complet au clavier (appuie sur ? pour les raccourcis) et à la manette : croix pour se déplacer, A pour ouvrir, B pour revenir, LB / RB pour changer de page.',
  'Reduce motion setting that can follow Windows, and an optional launch sound.': 'Réglage pour réduire les animations (peut suivre Windows) et son de lancement optionnel.',
  'Offline notice, loading placeholders and clearer error messages with a way to retry.': "Avis hors ligne, chargements animés et messages d'erreur plus clairs avec un bouton pour réessayer.",
  'A smoother start with a splash screen, a nicer installer and a smaller minimum window size for laptops and high-DPI screens.': "Un démarrage plus doux avec écran d'accueil, un installateur plus soigné et une taille de fenêtre minimale réduite pour les portables.",
  'Store covers turn grey and fill back up with colour as a game downloads.': 'Les jaquettes des stores passent en gris et se remplissent de couleur pendant le téléchargement.',
  'A brand-new icon set across the app.': "Un tout nouveau jeu d'icônes.", 'Correct artwork for Minecraft and portrait covers for HoYoverse games.': 'Les bons visuels pour Minecraft et des jaquettes portrait pour les jeux HoYoverse.',
  'Cleaner game names, a working Change banner and smoother title transitions.': 'Des noms de jeux plus propres, « Changer la bannière » qui marche et des transitions de titre plus douces.',
  'No more flicker: pages update in place and images fade in once loaded.': 'Fini le scintillement : les pages se mettent à jour sur place et les images apparaissent en fondu.',
  'Smooth transitions between game pages.': 'Transitions fluides entre les pages de jeu.', 'Downloads live in the sidebar with a progress ring.': 'Les téléchargements sont dans la barre latérale avec un anneau de progression.',
  'Discord shows "Playing <game>" with a button to Nightfall on GitHub.': 'Discord affiche « Joue à <jeu> » avec un bouton vers Nightfall sur GitHub.',
  'A real Settings page.': 'Une vraie page Paramètres.', 'News moved to its own page, with a drawer on game pages.': 'Les actualités ont leur page, avec un panneau sur les pages de jeu.',
  'Detailed downloads: speed, time left, disk activity.': 'Téléchargements détaillés : vitesse, temps restant, activité disque.', 'Steam friends without an API key.': 'Amis Steam sans clé API.',
  'News for HoYoverse, Fortnite, Valorant, League and Steam games.': 'Actualités HoYoverse, Fortnite, Valorant, League et jeux Steam.', 'Fortnite and Valorant match history.': 'Historique des parties Fortnite et Valorant.',
  "Store pages for games you own but haven't installed.": "Pages de store pour les jeux possédés mais non installés.", 'Your profile: picture, banner, bio and showcase.': 'Ton profil : photo, bannière, bio et vitrine.',
  'Pin games to the sidebar.': 'Épingle des jeux dans la barre latérale.',
  "A Video button on game pages: the background becomes the game's trailer, with a sound button.": "Un bouton Vidéo sur les pages de jeu : le fond devient la bande-annonce du jeu, avec un bouton pour le son.",
  "Pronouns on your profile, and your showcase can hold any game you own, even if it isn't installed.": "Des pronoms sur ton profil, et ta vitrine peut contenir n'importe quel jeu que tu possèdes, même non installé.",
  'Smoother game pages: the background fades into the page and switching games no longer flashes lines or numbers.': "Pages de jeu plus propres : le fond se fond dans la page et changer de jeu ne fait plus apparaître de lignes ni de chiffres.",
  'Video': 'Vidéo', 'Stop video': 'Arrêter la vidéo', 'Turn the sound on': 'Activer le son', 'Mute': 'Couper le son', 'Trailer': 'Bande-annonce',
  "Couldn't find a trailer for this game": 'Aucune bande-annonce trouvée pour ce jeu', "This game's trailer can't be played here": 'La bande-annonce de ce jeu ne peut pas être lue ici',
  'Pronouns': 'Pronoms', 'Pronouns saved': 'Pronoms enregistrés', "This game isn't in your store libraries any more": "Ce jeu n'est plus dans tes stores",
  "Pick up to 12 games for your profile, in the order you click them. Any game you own works, even if it isn't installed.": "Choisis jusqu'à 12 jeux pour ton profil, dans l'ordre où tu cliques. N'importe quel jeu que tu possèdes, même non installé.",
  "The library is now a clean grid of covers: the game's name sits on its art, no store tags or buttons. Play and Install wait on the game's page.": "La bibliothèque devient une grille de jaquettes épurée : le nom du jeu est écrit sur l'image, sans étiquettes ni boutons. Jouer et Installer sont sur la page du jeu.",
  'Downloads show their progress right on the cover.': 'Les téléchargements affichent leur progression directement sur la jaquette.',
  // review
  'Your top games': 'Tes jeux préférés', 'Favorite day': 'Jour préféré', 'Biggest day': 'Plus grosse journée', 'Nothing tracked yet this year. Play something and come back.': "Rien de suivi cette année. Joue un peu et reviens.",
  'Your most played games appear here.': 'Tes jeux les plus joués apparaissent ici.', 'played': 'joué', 'sessions': 'sessions', 'Monday': 'Lundi', 'Tuesday': 'Mardi', 'Wednesday': 'Mercredi',
  'Thursday': 'Jeudi', 'Friday': 'Vendredi', 'Saturday': 'Samedi', 'Sunday': 'Dimanche',
  // notifications sent from the interface
  'Finished installing from Steam.': "Installation terminée depuis Steam.", 'Finished installing from Epic Games.': 'Installation terminée depuis Epic Games.',
};
const ago = (s) => tr(s);
const R = [
  [/^([^·]+)'s logs$/, (_, g) => `journaux de ${g}`],
  [/^just now$/, () => "à l'instant"], [/^yesterday$/, () => 'hier'], [/^today$/, () => "aujourd'hui"],
  [/^(\d+) minutes ago$/, (_, n) => `il y a ${n} min`], [/^1 hour ago$/, () => 'il y a 1 heure'], [/^(\d+) hours ago$/, (_, n) => `il y a ${n} heures`],
  [/^(\d+) days ago$/, (_, n) => `il y a ${n} jours`],
  [/^Last played (.+)$/, (_, a) => `Dernière partie ${ago(a)}`], [/^Last online (.+)$/, (_, a) => `En ligne ${ago(a)}`], [/^Last backup (.+)$/, (_, a) => `Dernière sauvegarde ${ago(a)}`],
  [/^Added (.+)$/, (_, a) => `Ajouté ${ago(a)}`], [/^not played yet$/, () => 'pas encore joué'],
  [/^(.+) played$/, (_, a) => `${a} joués`], [/^(.+) total$/, (_, a) => `${a} en tout`], [/^(.+) this week$/, (_, a) => `${a} cette semaine`],
  [/^(\d+) sessions?$/, (_, n) => `${n} session${n === '1' ? '' : 's'}`], [/^(\d+) matche?s?$/, (_, n) => `${n} partie${n === '1' ? '' : 's'}`],
  [/^(\d+) games?$/, (_, n) => `${n} jeu${n === '1' ? '' : 'x'}`], [/^(\d+) online$/, (_, n) => `${n} en ligne`], [/^(\d+) playing$/, (_, n) => `${n} en jeu`],
  [/^(\d+) bookmarked$/, (_, n) => `${n} en favoris`], [/^(\d+) collections?$/, (_, n) => `${n} collection${n === '1' ? '' : 's'}`],
  [/^(\d+) games? installed and tracked$/, (_, n) => `${n} jeu${n === '1' ? '' : 'x'} installé${n === '1' ? '' : 's'} et suivi${n === '1' ? '' : 's'}`],
  [/^(\d+) games you own$/, (_, n) => `${n} jeux possédés`], [/^(\d+) installed here$/, (_, n) => `${n} installés ici`],
  [/^Running · (.+)$/, (_, c) => `En cours · ${c}`], [/^Playing now · (.+)$/, (_, c) => `En jeu · ${c}`], [/^Paused · (.+)$/, (_, p) => `En pause · ${p}`],
  [/^Last 30 days · (.+)$/, (_, f) => `30 derniers jours · ${tr(f)}`], [/^(\d+)% · Steam$/, (_, p) => `${p} % · Steam`], [/^(\d+) on this PC$/, (_, n) => `${n} sur ce PC`],
  [/^of (\d+) unlocked$/, (_, n) => `sur ${n} débloqués`], [/^Hidden · (\d+)$/, (_, n) => `Masqués · ${n}`],
  [/^(\d+) games? found$/, (_, n) => `${n} jeu${n === '1' ? '' : 'x'} trouvé${n === '1' ? '' : 's'}`], [/^(\d+) already in your library$/, (_, n) => `${n} déjà dans ta bibliothèque`],
  [/^Add (\d+) games?$/, (_, n) => `Ajouter ${n} jeu${n === '1' ? '' : 'x'}`], [/^Connect (\d+) games?$/, (_, n) => `Connecter ${n} jeu${n === '1' ? '' : 'x'}`],
  [/^(\d+) games? added$/, (_, n) => `${n} jeu${n === '1' ? '' : 'x'} ajouté${n === '1' ? '' : 's'}`], [/^Game added$/, () => 'Jeu ajouté'],
  [/^finding artwork$/, () => 'recherche des visuels'], [/^fetching artwork$/, () => 'récupération des visuels'], [/^fetching official artwork$/, () => 'récupération des visuels officiels'],
  [/^Connected (\d+) games?$/, (_, n) => `${n} jeu${n === '1' ? '' : 'x'} connecté${n === '1' ? '' : 's'}`],
  [/^Launching (.+)…$/, (_, g) => `Lancement de ${g}…`], [/^(.+) is already running$/, (_, g) => `${g} est déjà lancé`], [/^(.+) bookmarked$/, (_, g) => `${g} ajouté aux favoris`],
  [/^(.+) pinned to the sidebar$/, (_, g) => `${g} épinglé dans la barre`], [/^(.+) removed$/, (_, g) => `${g} retiré`], [/^Added to (.+)$/, (_, c) => `Ajouté à ${c}`],
  [/^(.+) finished installing$/, (_, g) => `${g} est installé`], [/^(.+) is ready to play$/, (_, g) => `${g} est prêt`], [/^Finished installing from (.+)\.$/, (_, s) => `Installation terminée depuis ${s}.`],
  [/^(.+) is hidden$/, (_, g) => `${g} est masqué`], [/^Library → Hidden brings it back$/, () => 'Bibliothèque → Masqués pour le retrouver'], [/^(.+) is back in your library$/, (_, g) => `${g} est de retour dans ta bibliothèque`],
  [/^Fetching artwork for (.+)…$/, (_, g) => `Récupération des visuels de ${g}…`], [/^Share (.+)$/, (_, g) => `Partager ${g}`], [/^Play (.+)$/, (_, g) => `Jouer à ${g}`], [/^Install (.+)$/, (_, g) => `Installer ${g}`],
  [/^(.+) news$/, (_, g) => `Actualités ${g}`], [/^From (.+)$/, (_, s) => `Source : ${s}`], [/^(\d+) of 12 picked$/, (_, n) => `${n} sur 12 choisis`],
  [/^(\d+) friends$/, (_, n) => `${n} amis`], [/^(\d+) online now$/, (_, n) => `${n} en ligne`], [/^read from your Steam app, no key needed$/, () => "lus depuis ton appli Steam, sans clé"],
  [/^read with your API key$/, () => 'lus avec ta clé API'], [/^(\d+) games$/, (_, n) => `${n} jeux`], [/^Signed in as$/, () => 'Connecté en tant que'],
  [/^Version (.+) is available\.$/, (_, v) => `La version ${v} est disponible.`], [/^Nightfall (.+) is available\.$/, (_, v) => `Nightfall ${v} est disponible.`],
  [/^Version (.+) is ready to install$/, (_, v) => `La version ${v} est prête à installer`], [/^Downloading (?:Nightfall )?(.+)… (\d+)%$/, (_, v, p) => `Téléchargement de ${v}… ${p} %`],
  [/^You're now on Nightfall (.+)\.$/, (_, v) => `Tu es maintenant sur Nightfall ${v}.`], [/^Report saved to Downloads$/, () => 'Rapport enregistré dans Téléchargements'],
  [/^Controller connected$/, () => 'Manette connectée'], [/^(.+) is ready\. D-pad to move, A to open, B to go back\.$/, (_, n) => `${n} est prête. Croix pour se déplacer, A pour ouvrir, B pour revenir.`],
  [/^(\d+) copies kept$/, (_, n) => `${n} copies gardées`], [/^1 copy kept$/, () => '1 copie gardée'], [/^(\d+) items?$/, (_, n) => `${n} élément${n === '1' ? '' : 's'}`],
  [/^(.+) of (.+) written so far$/, (_, a, b) => `${a} sur ${b} écrits`], [/^(.+) written so far$/, (_, a) => `${a} écrits`], [/^(.+) left$/, (_, a) => `${a} restant`],
  [/^(\S+ \S?B) of (\S+ \S?B)$/, (_, a, b) => `${a} sur ${b}`], [/^(\S+ \S?B) free$/, (_, a) => `${a} libres`], [/^done around (.+)$/, (_, t) => `fini vers ${t}`],
  [/^Waiting in (.+)$/, (_, s) => `En attente dans ${s}`], [/^(\d+) new this week$/, (_, n) => `${n} nouvelles cette semaine`],
  [/^(.+) is opening to install (.+)\. Progress shows here once it starts\.$/, (_, s, g) => `${s} s'ouvre pour installer ${g}. La progression s'affichera ici.`],
  [/^Paused in (.+)$/, (_, s) => `En pause dans ${s}`], [/^(\d{4}) in review$/, (_, y) => `Bilan ${y}`],
];
const SKIP = new Set(['SCRIPT', 'STYLE', 'KBD', 'CODE']);
// names of people, games and news are never translated (a friend called "Blue" stays Blue)
const NOTR = '.logo, [data-no-tr], .fr-tx b, .av-meta b, .side-item .n, .nm b, .m-tx b, .d-nm b, .a-tx b, .pf-card b, .pick-card b, #mTitle, .tile-g b, .d-what, .nw-card b, .news-cards b, .news-list b, .dl-title b, .scan-item b, #results button, .b-logo, #chipTxt .n, .pf-name, .onb-stores span';
// texts already in French are never translated again (no rule can loop on its own output)
const DONE = new Set();
const mark = (v) => { if (DONE.size > 4000) DONE.clear(); DONE.add(v); return v; };
function tr(s) {
  const t = s.trim(); if (!t || !/[A-Za-z]/.test(t)) return s;
  let r = D[t];
  if (r == null) for (const [re, f] of R) { const m = t.match(re); if (m) { r = f(...m); break; } }
  // "5m played · 1 hour ago": each part on its own
  if (r == null && t.includes(' · ')) { const parts = t.split(' · '); const out = parts.map((p) => tr(p)); if (out.some((x, i) => x !== parts[i])) r = out.join(' · '); }
  if (r == null) return s;
  return s.replace(t, r);
}
function walk(root) {
  if (root.nodeType === 3) { fix(root); return; }
  if (root.nodeType !== 1 || SKIP.has(root.tagName) || root.closest('[data-no-tr]')) return;
  attrs(root);
  const it = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = it.nextNode(); n; n = it.nextNode()) { if (n.nodeType === 3) fix(n); else attrs(n); }
}
function fix(n) {
  const p = n.parentElement; if (!p || SKIP.has(p.tagName) || p.closest(NOTR)) return;
  if (DONE.has(n.data)) return;
  const v = tr(n.data); if (v !== n.data) n.data = mark(v);
}
function attrs(el) {
  for (const a of ['placeholder', 'title', 'aria-label']) { const v = el.getAttribute(a); if (v && !DONE.has(v)) { const t = tr(v); if (t !== v) el.setAttribute(a, mark(t)); } }
}
const wantFR = () => { const l = (lib.settings && lib.settings.language) || 'auto'; return l === 'fr' || (l === 'auto' && /^fr/i.test(navigator.language)); };
let on = false;
function start() {
  on = true; window.FR = true; LOCALE = 'fr-FR'; // eslint-disable-line no-undef
  document.documentElement.lang = 'fr';
  // sentences split around links and bold words
  const steps = $('.st-steps');
  if (steps) steps.innerHTML = "<li>Ouvre le portail développeur et crée une <b>New Application</b>. Son nom est ce que voient tes amis.</li><li>Dans <b>General Information</b>, copie l'<b>Application ID</b> (pas la Public Key).</li><li>Colle-le ici et garde l'appli Discord ouverte.</li>";
  walk(document.body);
  new MutationObserver((ms) => {
    for (const m of ms) {
      if (m.type === 'characterData') fix(m.target);
      else if (m.type === 'attributes') attrs(m.target);
      else m.addedNodes.forEach(walk);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['placeholder', 'title', 'aria-label'] });
  const n0 = nf.notify; nf.notify = (t, b) => n0(tr(t), tr(b));
}
window.beforeFirstRender = () => { if (wantFR()) start(); };
// switching language redraws the window in the new language
window.applyLanguage = () => { if (wantFR() !== on) location.reload(); };
window.tr = tr;
})();
