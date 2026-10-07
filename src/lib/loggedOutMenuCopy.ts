import type { PlantieLanguage } from "./onboarding";

type InfoItem = { title: string; body: string };

export type LoggedOutMenuCopy = {
  heroBody: string;
  tagline: string;
  signedOutTitle: string;
  signedOutBody: string;
  accountDescription: string;
  householdDescription: string;
  householdIntro: string;
  householdFeatures: InfoItem[];
  sharingTitle: string;
  freeSharing: (count: number) => string;
  premiumSharing: (count: number) => string;
  occupiedSlotsBody: string;
  inviteTitle: string;
  inviteContinue: string;
  inviteExplanation: string;
  inviteInputLabel: string;
  subscriptionDescription: string;
  subscriptionIntro: string;
  pricesAfterSignIn: string;
  freePlanBody: string;
  monthlyPlanBody: string;
  yearlyPlanBody: string;
  premiumBenefitsTitle: string;
  freePlants: (count: number) => string;
  freeScans: (count: number) => string;
  freeQr: (count: number) => string;
  freeCareRefresh: (count: number) => string;
  premiumPlants: string;
  premiumScans: string;
  premiumQr: string;
  premiumCare: string;
  languageDescription: string;
  languageAiBody: string;
  languagePreviewLabel: string;
  supportTitle: string;
  supportDescription: string;
  supportContactPending: string;
  supportTips: InfoItem[];
  aboutTitle: string;
  aboutDescription: string;
  aboutIntro: string;
  aboutFeatures: string[];
  versionLabel: string;
  versionLoading: string;
  versionUnavailable: string;
  privacySummary: string;
  subscriptionTermsLabel: string;
};

const copy: Record<PlantieLanguage, LoggedOutMenuCopy> = {
  en: {
    heroBody: "Sign in, choose your language, and explore Plantie.",
    tagline: "Simple plant care.",
    signedOutTitle: "You're signed out",
    signedOutBody: "Sign in or create an account.",
    accountDescription: "Sign in, create an account, or reset your password.",
    householdDescription: "Share plants and care with your household.",
    householdIntro: "Share plant care with people you trust.",
    householdFeatures: [
      { title: "Shared care", body: "Active members can fully manage shared plants and care." },
      { title: "Owner & Viewer", body: "Owners manage members, settings, and billing. Active Viewers manage plants and care, without those controls." },
      { title: "Multiple households", body: "Join another household without losing your current one. Plants and plans stay separate." },
    ],
    sharingTitle: "Household capacity",
    freeSharing: (count) => `Free: ${count} occupied slot, no sharing.`,
    premiumSharing: (count) => `Premium: sharing with up to ${count} occupied slots`,
    occupiedSlotsBody: "Active members and valid pending invites count.",
    inviteTitle: "Have an invite?",
    inviteContinue: "Continue",
    inviteExplanation: "Use your invited email to sign in and review it.",
    inviteInputLabel: "Invitation link",
    subscriptionDescription: "Compare Free and Premium plans.",
    subscriptionIntro: "One plan covers the household.",
    pricesAfterSignIn: "Sign in to check current prices and availability.",
    freePlanBody: "One-person household with Free care limits.",
    monthlyPlanBody: "Premium, billed monthly.",
    yearlyPlanBody: "Same Premium features, billed yearly.",
    premiumBenefitsTitle: "Premium includes",
    freePlants: (count) => `${count} plants`,
    freeScans: (count) => `${count} AI health analyses per month`,
    freeQr: (count) => `${count} QR labels per PDF export`,
    freeCareRefresh: (count) => `${count} AI care-tip refresh per plant per day`,
    premiumPlants: "Unlimited plants",
    premiumScans: "Unlimited AI health analyses",
    premiumQr: "QR labels for all household plants",
    premiumCare: "Unlimited AI care-tip refreshes",
    languageDescription: "Choose your app and AI response language.",
    languageAiBody: "New AI responses use your selected app language.",
    languagePreviewLabel: "Interface preview",
    supportTitle: "Help & support",
    supportDescription: "Help with your account, invites, and subscription.",
    supportContactPending: "Direct support contact is not configured yet.",
    supportTips: [
      { title: "Account access", body: "Use your original email or Google account; reset your password if needed." },
      { title: "Invitations", body: "Verify the invited email. Ask an Owner for a new link if needed." },
      { title: "Subscriptions", body: "Check the selected household and retry loading billing details." },
    ],
    aboutTitle: "About Plantie",
    aboutDescription: "Plant care tools and app information.",
    aboutIntro: "Plant care, organised in one place.",
    aboutFeatures: ["Plant profiles and photos", "Watering and care records", "AI care tips and plant-health analyses", "QR labels and PDF export", "Premium household sharing"],
    versionLabel: "App version",
    versionLoading: "Loading version…",
    versionUnavailable: "Version unavailable",
    privacySummary: "Authentication is handled by Supabase Auth.",
    subscriptionTermsLabel: "Subscription terms",
  },
  sk: {
    heroBody: "Prihláste sa, vyberte jazyk a spoznajte Plantie.",
    tagline: "Jednoduchá starostlivosť o rastliny.",
    signedOutTitle: "Nie ste prihlásený",
    signedOutBody: "Prihláste sa alebo si vytvorte účet.",
    accountDescription: "Prihlásenie, vytvorenie účtu alebo obnovenie hesla.",
    householdDescription: "Zdieľajte rastliny a starostlivosť v domácnosti.",
    householdIntro: "Starajte sa o rastliny s ľuďmi, ktorým dôverujete.",
    householdFeatures: [
      { title: "Spoločná starostlivosť", body: "Aktívni členovia môžu plne spravovať spoločné rastliny a starostlivosť." },
      { title: "Vlastník a Pozorovateľ", body: "Vlastníci spravujú členov, nastavenia a platby. Aktívni Pozorovatelia spravujú rastliny a starostlivosť, bez týchto oprávnení." },
      { title: "Viac domácností", body: "Pripojte sa k ďalšej domácnosti bez straty pôvodnej. Rastliny a plány zostanú oddelené." },
    ],
    sharingTitle: "Kapacita domácnosti",
    freeSharing: (count) => `Free: ${count} obsadené miesto, bez zdieľania.`,
    premiumSharing: (count) => `Premium: zdieľanie s najviac ${count} obsadenými miestami`,
    occupiedSlotsBody: "Počítajú sa aktívni členovia aj platné čakajúce pozvánky.",
    inviteTitle: "Máte pozvánku?",
    inviteContinue: "Pokračovať",
    inviteExplanation: "Prihláste sa s pozvaným emailom a skontrolujte pozvánku.",
    inviteInputLabel: "Pozývací odkaz",
    subscriptionDescription: "Porovnajte plány Free a Premium.",
    subscriptionIntro: "Jeden plán platí pre domácnosť.",
    pricesAfterSignIn: "Prihláste sa a overte aktuálne ceny a dostupnosť.",
    freePlanBody: "Domácnosť pre jednu osobu s limitmi Free.",
    monthlyPlanBody: "Premium s mesačnou platbou.",
    yearlyPlanBody: "Rovnaké Premium funkcie s ročnou platbou.",
    premiumBenefitsTitle: "Premium zahŕňa",
    freePlants: (count) => `${count} rastlín`,
    freeScans: (count) => `${count} AI analýz zdravia mesačne`,
    freeQr: (count) => `${count} QR štítkov pri exporte PDF`,
    freeCareRefresh: (count) => `${count} obnovenie AI rád na rastlinu denne`,
    premiumPlants: "Neobmedzený počet rastlín",
    premiumScans: "Neobmedzené AI analýzy zdravia",
    premiumQr: "QR štítky všetkých rastlín domácnosti",
    premiumCare: "Neobmedzené obnovovanie AI rád",
    languageDescription: "Vyberte jazyk aplikácie a AI odpovedí.",
    languageAiBody: "Nové AI odpovede používajú vybraný jazyk aplikácie.",
    languagePreviewLabel: "Ukážka rozhrania",
    supportTitle: "Pomoc a podpora",
    supportDescription: "Pomoc s účtom, pozvánkami a predplatným.",
    supportContactPending: "Priamy kontakt na podporu zatiaľ nie je nastavený.",
    supportTips: [
      { title: "Prístup k účtu", body: "Použite pôvodný email alebo Google účet; podľa potreby obnovte heslo." },
      { title: "Pozvánky", body: "Overte pozvaný email. Ak treba, požiadajte Vlastníka o nový odkaz." },
      { title: "Predplatné", body: "Skontrolujte vybranú domácnosť a skúste znova načítať údaje platieb." },
    ],
    aboutTitle: "O Plantie",
    aboutDescription: "Nástroje starostlivosti a informácie o aplikácii.",
    aboutIntro: "Starostlivosť o rastliny na jednom mieste.",
    aboutFeatures: ["Profily rastlín a fotografie", "Zálievky a záznamy starostlivosti", "AI rady a analýzy zdravia rastlín", "QR štítky a export do PDF", "Zdieľanie Premium domácnosti"],
    versionLabel: "Verzia aplikácie",
    versionLoading: "Načítava sa verzia…",
    versionUnavailable: "Verzia nie je dostupná",
    privacySummary: "Prihlásenie spravuje Supabase Auth.",
    subscriptionTermsLabel: "Podmienky predplatného",
  },
  de: {
    heroBody: "Melde dich an, wähle deine Sprache und entdecke Plantie.",
    tagline: "Einfache Pflanzenpflege.",
    signedOutTitle: "Du bist abgemeldet",
    signedOutBody: "Melde dich an oder erstelle ein Konto.",
    accountDescription: "Anmelden, ein Konto erstellen oder das Passwort zurücksetzen.",
    householdDescription: "Teile Pflanzen und Pflege mit deinem Haushalt.",
    householdIntro: "Pflege Pflanzen mit Menschen, denen du vertraust.",
    householdFeatures: [
      { title: "Gemeinsame Pflege", body: "Aktive Mitglieder können gemeinsame Pflanzen und ihre Pflege vollständig verwalten." },
      { title: "Eigentümer & Betrachter", body: "Eigentümer verwalten Mitglieder, Einstellungen und Abrechnung. Aktive Betrachter verwalten Pflanzen und Pflege, ohne diese Rechte." },
      { title: "Mehrere Haushalte", body: "Tritt einem weiteren Haushalt bei, ohne den bisherigen zu verlieren. Pflanzen und Pläne bleiben getrennt." },
    ],
    sharingTitle: "Haushaltskapazität",
    freeSharing: (count) => `Free: ${count} belegter Platz, ohne Freigabe.`,
    premiumSharing: (count) => `Premium: gemeinsam nutzen mit bis zu ${count} belegten Plätzen`,
    occupiedSlotsBody: "Aktive Mitglieder und gültige offene Einladungen zählen.",
    inviteTitle: "Hast du eine Einladung?",
    inviteContinue: "Weiter",
    inviteExplanation: "Melde dich mit der eingeladenen E-Mail-Adresse an und prüfe die Einladung.",
    inviteInputLabel: "Einladungslink",
    subscriptionDescription: "Vergleiche Free- und Premium-Pläne.",
    subscriptionIntro: "Ein Plan gilt für den Haushalt.",
    pricesAfterSignIn: "Melde dich an, um aktuelle Preise und Verfügbarkeit zu prüfen.",
    freePlanBody: "Einpersonenhaushalt mit Free-Pflegelimits.",
    monthlyPlanBody: "Premium, monatlich abgerechnet.",
    yearlyPlanBody: "Dieselben Premium-Funktionen, jährlich abgerechnet.",
    premiumBenefitsTitle: "Premium enthält",
    freePlants: (count) => `${count} Pflanzen`,
    freeScans: (count) => `${count} KI-Gesundheitsanalysen pro Monat`,
    freeQr: (count) => `${count} QR-Etiketten je PDF-Export`,
    freeCareRefresh: (count) => `${count} Aktualisierung der KI-Pflegetipps je Pflanze und Tag`,
    premiumPlants: "Unbegrenzte Pflanzen",
    premiumScans: "Unbegrenzte KI-Gesundheitsanalysen",
    premiumQr: "QR-Etiketten für alle Haushaltspflanzen",
    premiumCare: "Unbegrenzte Aktualisierungen der KI-Pflegetipps",
    languageDescription: "Wähle die Sprache für die App und KI-Antworten.",
    languageAiBody: "Neue KI-Antworten verwenden deine gewählte App-Sprache.",
    languagePreviewLabel: "Vorschau der Oberfläche",
    supportTitle: "Hilfe und Support",
    supportDescription: "Hilfe zu Konto, Einladungen und Abonnement.",
    supportContactPending: "Ein direkter Supportkontakt ist noch nicht eingerichtet.",
    supportTips: [
      { title: "Kontozugang", body: "Nutze deine ursprüngliche E-Mail-Adresse oder dein Google-Konto; setze bei Bedarf das Passwort zurück." },
      { title: "Einladungen", body: "Bestätige die eingeladene E-Mail-Adresse. Bitte bei Bedarf einen Eigentümer um einen neuen Link." },
      { title: "Abonnements", body: "Prüfe den ausgewählten Haushalt und lade die Abrechnungsdetails erneut." },
    ],
    aboutTitle: "Über Plantie",
    aboutDescription: "Pflanzenpflege und App-Informationen.",
    aboutIntro: "Pflanzenpflege an einem Ort.",
    aboutFeatures: ["Pflanzenprofile und Fotos", "Gießen und Pflegeeinträge", "KI-Pflegetipps und Pflanzengesundheitsanalysen", "QR-Etiketten und PDF-Export", "Gemeinsame Premium-Haushalte"],
    versionLabel: "App-Version",
    versionLoading: "Version wird geladen…",
    versionUnavailable: "Version nicht verfügbar",
    privacySummary: "Die Anmeldung erfolgt über Supabase Auth.",
    subscriptionTermsLabel: "Abonnementbedingungen",
  },
  fr: {
    heroBody: "Connectez-vous, choisissez votre langue et découvrez Plantie.",
    tagline: "L'entretien des plantes, simplement.",
    signedOutTitle: "Vous êtes déconnecté",
    signedOutBody: "Connectez-vous ou créez un compte.",
    accountDescription: "Connexion, création de compte ou réinitialisation du mot de passe.",
    householdDescription: "Partagez vos plantes et leur entretien dans votre foyer.",
    householdIntro: "Entretenez les plantes avec des personnes de confiance.",
    householdFeatures: [
      { title: "Entretien partagé", body: "Les membres actifs peuvent gérer entièrement les plantes et leur entretien." },
      { title: "Propriétaire et Observateur", body: "Les Propriétaires gèrent membres, réglages et facturation. Les Observateurs actifs gèrent plantes et entretien, sans ces droits." },
      { title: "Plusieurs foyers", body: "Rejoignez un autre foyer sans perdre le vôtre. Les plantes et les plans restent séparés." },
    ],
    sharingTitle: "Capacité du foyer",
    freeSharing: (count) => `Free : ${count} place occupée, sans partage.`,
    premiumSharing: (count) => `Premium : partage avec jusqu'à ${count} places occupées`,
    occupiedSlotsBody: "Les membres actifs et les invitations valides en attente comptent.",
    inviteTitle: "Vous avez une invitation ?",
    inviteContinue: "Continuer",
    inviteExplanation: "Connectez-vous avec l'email invité pour consulter l'invitation.",
    inviteInputLabel: "Lien d’invitation",
    subscriptionDescription: "Comparez les plans Free et Premium.",
    subscriptionIntro: "Un plan couvre le foyer.",
    pricesAfterSignIn: "Connectez-vous pour vérifier les prix actuels et la disponibilité.",
    freePlanBody: "Foyer individuel avec les limites d'entretien Free.",
    monthlyPlanBody: "Premium, facturé chaque mois.",
    yearlyPlanBody: "Mêmes fonctions Premium, facturées chaque année.",
    premiumBenefitsTitle: "Premium comprend",
    freePlants: (count) => `${count} plantes`,
    freeScans: (count) => `${count} analyses IA de santé par mois`,
    freeQr: (count) => `${count} étiquettes QR par export PDF`,
    freeCareRefresh: (count) => `${count} actualisation des conseils IA par plante et par jour`,
    premiumPlants: "Plantes illimitées",
    premiumScans: "Analyses IA de santé illimitées",
    premiumQr: "Étiquettes QR pour toutes les plantes du foyer",
    premiumCare: "Actualisations des conseils IA illimitées",
    languageDescription: "Choisissez la langue de l'app et des réponses IA.",
    languageAiBody: "Les nouvelles réponses IA utilisent la langue choisie pour l'app.",
    languagePreviewLabel: "Aperçu de l'interface",
    supportTitle: "Aide et assistance",
    supportDescription: "Aide pour le compte, les invitations et l'abonnement.",
    supportContactPending: "Aucun contact direct d'assistance n'est encore configuré.",
    supportTips: [
      { title: "Accès au compte", body: "Utilisez votre email ou compte Google d'origine ; réinitialisez le mot de passe si nécessaire." },
      { title: "Invitations", body: "Vérifiez l'email invité. Demandez un nouveau lien à un Propriétaire si nécessaire." },
      { title: "Abonnements", body: "Vérifiez le foyer sélectionné et rechargez les détails de facturation." },
    ],
    aboutTitle: "À propos de Plantie",
    aboutDescription: "Outils d'entretien et informations sur l'app.",
    aboutIntro: "L'entretien des plantes au même endroit.",
    aboutFeatures: ["Fiches des plantes et photos", "Arrosages et historique d'entretien", "Conseils IA et analyses de santé des plantes", "Étiquettes QR et export PDF", "Partage du foyer avec Premium"],
    versionLabel: "Version de l'app",
    versionLoading: "Chargement de la version…",
    versionUnavailable: "Version indisponible",
    privacySummary: "L'authentification est gérée par Supabase Auth.",
    subscriptionTermsLabel: "Conditions d'abonnement",
  },
  es: {
    heroBody: "Inicia sesión, elige tu idioma y descubre Plantie.",
    tagline: "Cuidados sencillos para tus plantas.",
    signedOutTitle: "No has iniciado sesión",
    signedOutBody: "Inicia sesión o crea una cuenta.",
    accountDescription: "Iniciar sesión, crear cuenta o restablecer la contraseña.",
    householdDescription: "Comparte plantas y cuidados con tu hogar.",
    householdIntro: "Cuida las plantas con personas de confianza.",
    householdFeatures: [
      { title: "Cuidados compartidos", body: "Los miembros activos pueden gestionar todas las plantas y sus cuidados." },
      { title: "Propietario y Observador", body: "Los Propietarios gestionan miembros, ajustes y facturación. Los Observadores activos gestionan plantas y cuidados, sin esos permisos." },
      { title: "Varios hogares", body: "Únete a otro hogar sin perder el actual. Las plantas y los planes siguen separados." },
    ],
    sharingTitle: "Capacidad del hogar",
    freeSharing: (count) => `Free: ${count} plaza ocupada, sin compartir.`,
    premiumSharing: (count) => `Premium: compartir con hasta ${count} plazas ocupadas`,
    occupiedSlotsBody: "Cuentan los miembros activos y las invitaciones pendientes válidas.",
    inviteTitle: "¿Tienes una invitación?",
    inviteContinue: "Continuar",
    inviteExplanation: "Inicia sesión con el email invitado para revisar la invitación.",
    inviteInputLabel: "Enlace de invitación",
    subscriptionDescription: "Compara los planes Free y Premium.",
    subscriptionIntro: "Un plan cubre el hogar.",
    pricesAfterSignIn: "Inicia sesión para comprobar precios actuales y disponibilidad.",
    freePlanBody: "Hogar individual con límites de cuidados Free.",
    monthlyPlanBody: "Premium, con facturación mensual.",
    yearlyPlanBody: "Mismas funciones Premium, con facturación anual.",
    premiumBenefitsTitle: "Premium incluye",
    freePlants: (count) => `${count} plantas`,
    freeScans: (count) => `${count} análisis de salud con IA al mes`,
    freeQr: (count) => `${count} etiquetas QR por exportación PDF`,
    freeCareRefresh: (count) => `${count} actualización de consejos IA por planta al día`,
    premiumPlants: "Plantas ilimitadas",
    premiumScans: "Análisis de salud con IA ilimitados",
    premiumQr: "Etiquetas QR para todas las plantas del hogar",
    premiumCare: "Actualizaciones de consejos IA ilimitadas",
    languageDescription: "Elige el idioma de la app y las respuestas de IA.",
    languageAiBody: "Las nuevas respuestas de IA usan el idioma elegido para la app.",
    languagePreviewLabel: "Vista previa de la interfaz",
    supportTitle: "Ayuda y soporte",
    supportDescription: "Ayuda con la cuenta, invitaciones y suscripción.",
    supportContactPending: "Todavía no hay un contacto de soporte directo configurado.",
    supportTips: [
      { title: "Acceso a la cuenta", body: "Usa tu email o cuenta de Google original; restablece la contraseña si lo necesitas." },
      { title: "Invitaciones", body: "Verifica el email invitado. Pide un nuevo enlace a un Propietario si lo necesitas." },
      { title: "Suscripciones", body: "Comprueba el hogar seleccionado y vuelve a cargar la facturación." },
    ],
    aboutTitle: "Acerca de Plantie",
    aboutDescription: "Herramientas de cuidados e información de la app.",
    aboutIntro: "Los cuidados de tus plantas en un solo lugar.",
    aboutFeatures: ["Fichas de plantas y fotos", "Riegos y registros de cuidados", "Consejos IA y análisis de salud de plantas", "Etiquetas QR y exportación PDF", "Hogares compartidos con Premium"],
    versionLabel: "Versión de la app",
    versionLoading: "Cargando la versión…",
    versionUnavailable: "Versión no disponible",
    privacySummary: "La autenticación se gestiona con Supabase Auth.",
    subscriptionTermsLabel: "Condiciones de suscripción",
  },
};

export const loggedOutMenuCopy = (language: PlantieLanguage): LoggedOutMenuCopy => copy[language];
