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
  ownerTitle: string;
  ownerBody: string;
  viewerTitle: string;
  viewerBody: string;
  sharingTitle: string;
  freeSharing: (count: number) => string;
  premiumSharing: (count: number) => string;
  occupiedSlotsBody: string;
  multiHouseholdBody: string;
  inviteExplanation: string;
  inviteInputLabel: string;
  subscriptionDescription: string;
  subscriptionIntro: string;
  pricesAfterSignIn: string;
  freePlanBody: string;
  premiumPlanBody: string;
  freePlants: (count: number) => string;
  freeScans: (count: number) => string;
  freeQr: (count: number) => string;
  freeCareRefresh: (count: number) => string;
  premiumPlants: string;
  premiumScans: string;
  premiumQr: string;
  premiumCare: string;
  ownerBillingBody: string;
  cancellationBody: string;
  historyTitle: string;
  historyBody: string;
  languageDescription: string;
  languageBody: string;
  languagePreviewLabel: string;
  supportTitle: string;
  supportDescription: string;
  supportBody: string;
  supportContactPending: string;
  troubleshootingTitle: string;
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
    inviteInputLabel: "Invitation link or token",
    subscriptionTermsLabel: "Subscription terms",
    heroBody: "Care for your plants, understand their needs, and organise care together.",
    tagline: "Your plants. Your household. Everyday care.",
    signedOutTitle: "You're signed out",
    signedOutBody: "Sign in to open your plants and households, or create an account to get started.",
    accountDescription: "Sign in, create an account, or reset your password.",
    householdDescription: "Shared plants, member roles, and household invitations.",
    householdIntro: "A household keeps its plants, care records, and members together in one place.",
    householdFeatures: [
      { title: "Care together", body: "Keep plant profiles, photos, watering records, and care notes in the same household." },
      { title: "Share with an invitation", body: "Premium Owners can invite someone by email, even before they have a Plantie account." },
      { title: "Clear member roles", body: "Owners and active Viewers both manage plants and care. Only Owners administer the household." },
      { title: "More than one household", body: "Switch between households you belong to. Each keeps its own plants, members, and subscription." },
    ],
    ownerTitle: "Owner",
    ownerBody: "Manage plants and care, edit the household, invite or remove Viewers, and manage its subscription with the account authorised for billing.",
    viewerTitle: "Viewer",
    viewerBody: "Active Viewers can add, edit, and delete plants, record care, and use AI and QR tools. They cannot edit the household, manage members, or change billing.",
    sharingTitle: "Household capacity",
    freeSharing: (count) => `Free: ${count} occupied slot in a standard household, with no sharing or invitations.`,
    premiumSharing: (count) => `Premium: up to ${count} occupied slots, including the Owner.`,
    occupiedSlotsBody: "Active members and valid pending invitations both occupy a slot. Declined, revoked, and expired invitations release their slot.",
    multiHouseholdBody: "Joining another household keeps your existing households. Premium belongs to one household and covers its active members; it does not upgrade your other households.",
    inviteExplanation: "Open the invite link and sign in, or create an account, with the invited email address. Verify that email, review the invitation, then accept or decline. Invitations expire after seven days.",
    subscriptionDescription: "Compare Free and household Premium before signing in.",
    subscriptionIntro: "Plans apply to a household. Monthly and yearly Premium provide the same plant and care features.",
    pricesAfterSignIn: "Sign in to load current prices and purchase options for your platform. Prices come from the billing provider when available.",
    freePlanBody: "Start without a subscription and care for your own plant collection.",
    premiumPlanBody: "Higher care limits and sharing for all active members of the subscribed household.",
    freePlants: (count) => `Up to ${count} plants per household`,
    freeScans: (count) => `${count} AI plant-health analyses per household each month`,
    freeQr: (count) => `Export up to ${count} plant QR labels in a PDF`,
    freeCareRefresh: (count) => `${count} AI care-tip refresh per plant each day; initial care generation is separate`,
    premiumPlants: "Unlimited plants",
    premiumScans: "Unlimited AI plant-health analyses",
    premiumQr: "Export QR labels for all household plants",
    premiumCare: "Unlimited AI care-tip refreshes",
    ownerBillingBody: "Only Owners manage purchases and cancellation. Some subscriptions require the original purchasing account. Active Viewers share Premium access without managing billing.",
    cancellationBody: "Cancelling renewal keeps Premium until the paid period ends. The household then switches to Free and Viewer access is suspended; shared plant data is retained.",
    historyTitle: "Billing & history",
    historyBody: "After signing in, active Owners and Viewers can read their household's subscription history. Only Owners can manage billing.",
    languageDescription: "Choose the language for the interface and new AI responses.",
    languageBody: "Changes apply immediately and are saved on this device. New AI care advice uses the selected language; previously saved plant text stays as written.",
    languagePreviewLabel: "Interface preview",
    supportTitle: "Help & support",
    supportDescription: "Help with access, invitations, and subscriptions.",
    supportBody: "Open the support page for guidance. When describing an issue, include your device, app version, and what happened, without passwords or invitation tokens.",
    supportContactPending: "A direct support contact is not configured yet.",
    troubleshootingTitle: "Things to check",
    supportTips: [
      { title: "Account access", body: "Use the same email or Google account you registered with. Use password reset if you signed up with an email and password." },
      { title: "Household invitations", body: "Sign in with the invited email and verify it. Ask an Owner for a new invitation if the link has expired or was revoked." },
      { title: "Subscription details", body: "Check the selected household and retry loading billing details. Manage an existing purchase with the authorised purchasing account." },
    ],
    aboutTitle: "About Plantie",
    aboutDescription: "Plant care tools, privacy, and your app version.",
    aboutIntro: "Plantie helps you keep plant care organised, with shared household records and AI guidance when you need it.",
    aboutFeatures: ["Plant profiles and photos", "Watering schedules and care records", "AI care tips and plant-health analyses", "Plant QR labels and PDF export", "Premium household sharing"],
    versionLabel: "App version",
    versionLoading: "Loading app version…",
    versionUnavailable: "App version unavailable",
    privacySummary: "Account, household, and plant data are stored with Supabase. Photos and prompts may be processed for AI guidance. Read the privacy policy for data handling details.",
  },
  sk: {
    inviteInputLabel: "Pozývací odkaz alebo token",
    subscriptionTermsLabel: "Podmienky predplatného",
    heroBody: "Starajte sa o rastliny, spoznajte ich potreby a rozdeľte si starostlivosť v domácnosti.",
    tagline: "Vaše rastliny. Vaša domácnosť. Každodenná starostlivosť.",
    signedOutTitle: "Nie ste prihlásený",
    signedOutBody: "Prihláste sa k svojim rastlinám a domácnostiam alebo si vytvorte účet.",
    accountDescription: "Prihlásenie, vytvorenie účtu alebo obnovenie hesla.",
    householdDescription: "Spoločné rastliny, roly členov a pozvánky do domácnosti.",
    householdIntro: "Domácnosť spája rastliny, záznamy o starostlivosti a členov na jednom mieste.",
    householdFeatures: [
      { title: "Spoločná starostlivosť", body: "Profily rastlín, fotografie, zálievky a poznámky patria do rovnakej domácnosti." },
      { title: "Zdieľanie cez pozvánku", body: "Vlastník Premium domácnosti môže pozvať človeka emailom, aj keď ešte nemá účet Plantie." },
      { title: "Jasné roly členov", body: "Vlastníci aj aktívni Pozorovatelia spravujú rastliny a starostlivosť. Domácnosť spravujú iba Vlastníci." },
      { title: "Viac domácností", body: "Prepínajte medzi domácnosťami, ktorých ste členom. Každá má vlastné rastliny, členov a predplatné." },
    ],
    ownerTitle: "Vlastník",
    ownerBody: "Spravuje rastliny a starostlivosť, upravuje domácnosť, pozýva alebo odstraňuje Pozorovateľov a spravuje predplatné cez účet oprávnený na platby.",
    viewerTitle: "Pozorovateľ",
    viewerBody: "Aktívny Pozorovateľ môže pridávať, upravovať a mazať rastliny, zapisovať starostlivosť a používať AI a QR nástroje. Nemôže upravovať domácnosť, spravovať členov ani meniť platby.",
    sharingTitle: "Kapacita domácnosti",
    freeSharing: (count) => `Free: ${count} obsadené miesto v štandardnej domácnosti, bez zdieľania a pozvánok.`,
    premiumSharing: (count) => `Premium: najviac ${count} obsadené miesta vrátane Vlastníka.`,
    occupiedSlotsBody: "Miesto zaberá aktívny člen aj platná čakajúca pozvánka. Odmietnutá, zrušená alebo vypršaná pozvánka miesto uvoľní.",
    multiHouseholdBody: "Pripojením k ďalšej domácnosti si ponecháte existujúce domácnosti. Premium patrí jednej domácnosti a jej aktívnym členom; ostatné domácnosti sa tým nezmenia.",
    inviteExplanation: "Otvorte pozývací odkaz a prihláste sa alebo si vytvorte účet s pozvaným emailom. Overte email, skontrolujte pozvánku a prijmite ju alebo odmietnite. Pozvánky platia sedem dní.",
    subscriptionDescription: "Porovnajte Free a Premium domácnosť ešte pred prihlásením.",
    subscriptionIntro: "Plán platí pre domácnosť. Mesačné a ročné Premium majú rovnaké funkcie pre rastliny a starostlivosť.",
    pricesAfterSignIn: "Prihláste sa a načítajte aktuálne ceny a možnosti nákupu pre svoju platformu. Dostupné ceny poskytuje platobná služba.",
    freePlanBody: "Začnite bez predplatného a starajte sa o vlastnú zbierku rastlín.",
    premiumPlanBody: "Vyššie limity starostlivosti a zdieľanie pre všetkých aktívnych členov predplatenej domácnosti.",
    freePlants: (count) => `Najviac ${count} rastlín v domácnosti`,
    freeScans: (count) => `${count} AI analýz zdravia rastlín mesačne pre domácnosť`,
    freeQr: (count) => `Export najviac ${count} QR štítkov rastlín do PDF`,
    freeCareRefresh: (count) => `${count} obnovenie AI rád denne pre rastlinu; prvé vytvorenie rád je samostatné`,
    premiumPlants: "Neobmedzený počet rastlín",
    premiumScans: "Neobmedzené AI analýzy zdravia rastlín",
    premiumQr: "Export QR štítkov všetkých rastlín domácnosti",
    premiumCare: "Neobmedzené obnovovanie AI rád",
    ownerBillingBody: "Nákupy a zrušenie obnovovania spravujú iba Vlastníci. Niektoré predplatné vyžaduje pôvodný účet nákupu. Aktívni Pozorovatelia využívajú Premium bez správy platieb.",
    cancellationBody: "Po zrušení obnovovania zostane Premium do konca zaplateného obdobia. Potom sa domácnosť prepne na Free a prístup Pozorovateľov sa pozastaví; údaje rastlín zostanú zachované.",
    historyTitle: "Platby a história",
    historyBody: "Po prihlásení si aktívni Vlastníci aj Pozorovatelia môžu prezerať históriu predplatného domácnosti. Platby spravujú iba Vlastníci.",
    languageDescription: "Vyberte jazyk rozhrania a nových AI odpovedí.",
    languageBody: "Zmena sa prejaví ihneď a uloží sa na tomto zariadení. Nové AI rady používajú vybraný jazyk; skôr uložené texty rastlín zostávajú pôvodné.",
    languagePreviewLabel: "Ukážka rozhrania",
    supportTitle: "Pomoc a podpora",
    supportDescription: "Pomoc s prístupom, pozvánkami a predplatným.",
    supportBody: "Pokyny nájdete na stránke podpory. Pri opise problému uveďte zariadenie, verziu aplikácie a čo sa stalo, bez hesiel a tokenov pozvánok.",
    supportContactPending: "Priamy kontakt na podporu zatiaľ nie je nastavený.",
    troubleshootingTitle: "Čo skontrolovať",
    supportTips: [
      { title: "Prístup k účtu", body: "Použite rovnaký email alebo Google účet ako pri registrácii. Pri účte s emailom a heslom môžete použiť obnovenie hesla." },
      { title: "Pozvánky do domácnosti", body: "Prihláste sa s pozvaným emailom a overte ho. Ak odkaz vypršal alebo bol zrušený, požiadajte Vlastníka o novú pozvánku." },
      { title: "Údaje predplatného", body: "Skontrolujte vybranú domácnosť a skúste údaje platieb načítať znova. Existujúci nákup spravujte cez oprávnený účet nákupu." },
    ],
    aboutTitle: "O Plantie",
    aboutDescription: "Nástroje starostlivosti o rastliny, súkromie a verzia aplikácie.",
    aboutIntro: "Plantie pomáha organizovať starostlivosť o rastliny pomocou spoločných záznamov domácnosti a AI rád.",
    aboutFeatures: ["Profily rastlín a fotografie", "Plány zálievky a záznamy starostlivosti", "AI rady a analýzy zdravia rastlín", "QR štítky rastlín a export do PDF", "Zdieľanie Premium domácnosti"],
    versionLabel: "Verzia aplikácie",
    versionLoading: "Načítava sa verzia aplikácie…",
    versionUnavailable: "Verzia aplikácie nie je dostupná",
    privacySummary: "Údaje účtu, domácnosti a rastlín sa ukladajú v Supabase. Fotografie a zadania sa môžu spracovať na vytvorenie AI rád. Podrobnosti sú v pravidlách ochrany súkromia.",
  },
  de: {
    inviteInputLabel: "Einladungslink oder Token",
    subscriptionTermsLabel: "Abonnementbedingungen",
    heroBody: "Pflege deine Pflanzen, verstehe ihre Bedürfnisse und organisiere die Pflege gemeinsam.",
    tagline: "Deine Pflanzen. Dein Haushalt. Tägliche Pflege.",
    signedOutTitle: "Du bist abgemeldet",
    signedOutBody: "Melde dich an, um deine Pflanzen und Haushalte zu öffnen, oder erstelle ein Konto.",
    accountDescription: "Anmelden, ein Konto erstellen oder das Passwort zurücksetzen.",
    householdDescription: "Gemeinsame Pflanzen, Mitgliedsrollen und Haushaltseinladungen.",
    householdIntro: "Ein Haushalt vereint Pflanzen, Pflegeeinträge und Mitglieder an einem Ort.",
    householdFeatures: [
      { title: "Gemeinsam pflegen", body: "Pflanzenprofile, Fotos, Gießeinträge und Pflegenotizen bleiben im selben Haushalt." },
      { title: "Per Einladung teilen", body: "Premium-Eigentümer können Personen per E-Mail einladen, auch bevor sie ein Plantie-Konto haben." },
      { title: "Klare Mitgliedsrollen", body: "Eigentümer und aktive Betrachter verwalten Pflanzen und Pflege. Nur Eigentümer verwalten den Haushalt." },
      { title: "Mehrere Haushalte", body: "Wechsle zwischen deinen Haushalten. Jeder hat eigene Pflanzen, Mitglieder und ein eigenes Abonnement." },
    ],
    ownerTitle: "Eigentümer",
    ownerBody: "Verwaltet Pflanzen und Pflege, bearbeitet den Haushalt, lädt Betrachter ein oder entfernt sie und verwaltet das Abonnement mit dem für die Abrechnung berechtigten Konto.",
    viewerTitle: "Betrachter",
    viewerBody: "Aktive Betrachter können Pflanzen hinzufügen, bearbeiten und löschen, Pflege erfassen und KI- sowie QR-Werkzeuge nutzen. Sie können weder den Haushalt noch Mitglieder oder die Abrechnung verwalten.",
    sharingTitle: "Haushaltskapazität",
    freeSharing: (count) => `Free: ${count} belegter Platz in einem Standardhaushalt, ohne Freigabe oder Einladungen.`,
    premiumSharing: (count) => `Premium: bis zu ${count} belegte Plätze einschließlich des Eigentümers.`,
    occupiedSlotsBody: "Aktive Mitglieder und gültige ausstehende Einladungen belegen jeweils einen Platz. Abgelehnte, widerrufene und abgelaufene Einladungen geben ihn frei.",
    multiHouseholdBody: "Beim Beitritt zu einem weiteren Haushalt bleiben deine bestehenden Haushalte erhalten. Premium gilt für einen Haushalt und seine aktiven Mitglieder, nicht für deine anderen Haushalte.",
    inviteExplanation: "Öffne den Einladungslink und melde dich mit der eingeladenen E-Mail-Adresse an oder erstelle ein Konto. Bestätige die Adresse, prüfe die Einladung und nimm sie an oder lehne sie ab. Einladungen gelten sieben Tage.",
    subscriptionDescription: "Vergleiche Free und Haushalts-Premium vor der Anmeldung.",
    subscriptionIntro: "Pläne gelten für einen Haushalt. Monatliches und jährliches Premium bieten dieselben Pflanzen- und Pflegefunktionen.",
    pricesAfterSignIn: "Melde dich an, um aktuelle Preise und Kaufoptionen für deine Plattform zu laden. Verfügbare Preise stammen vom Abrechnungsanbieter.",
    freePlanBody: "Beginne ohne Abonnement und pflege deine eigene Pflanzensammlung.",
    premiumPlanBody: "Höhere Pflegelimits und gemeinsamer Zugriff für alle aktiven Mitglieder des abonnierten Haushalts.",
    freePlants: (count) => `Bis zu ${count} Pflanzen pro Haushalt`,
    freeScans: (count) => `${count} KI-Analysen zur Pflanzengesundheit pro Haushalt und Monat`,
    freeQr: (count) => `Bis zu ${count} Pflanzen-QR-Etiketten als PDF exportieren`,
    freeCareRefresh: (count) => `${count} Aktualisierung der KI-Pflegetipps pro Pflanze und Tag; die erste Erstellung zählt separat`,
    premiumPlants: "Unbegrenzte Pflanzen",
    premiumScans: "Unbegrenzte KI-Analysen zur Pflanzengesundheit",
    premiumQr: "QR-Etiketten für alle Haushaltspflanzen exportieren",
    premiumCare: "Unbegrenzte Aktualisierungen der KI-Pflegetipps",
    ownerBillingBody: "Nur Eigentümer verwalten Käufe und Kündigungen. Manche Abonnements erfordern das ursprüngliche Käuferkonto. Aktive Betrachter nutzen Premium ohne Zugriff auf die Abrechnung.",
    cancellationBody: "Nach der Kündigung der Verlängerung bleibt Premium bis zum Ende des bezahlten Zeitraums aktiv. Danach wechselt der Haushalt zu Free und der Zugriff von Betrachtern wird ausgesetzt; Pflanzendaten bleiben erhalten.",
    historyTitle: "Abrechnung und Verlauf",
    historyBody: "Nach der Anmeldung können aktive Eigentümer und Betrachter den Abonnementverlauf ihres Haushalts lesen. Nur Eigentümer verwalten die Abrechnung.",
    languageDescription: "Wähle die Sprache der Oberfläche und neuer KI-Antworten.",
    languageBody: "Änderungen gelten sofort und werden auf diesem Gerät gespeichert. Neue KI-Pflegetipps verwenden die gewählte Sprache; gespeicherte Pflanzentexte bleiben unverändert.",
    languagePreviewLabel: "Vorschau der Oberfläche",
    supportTitle: "Hilfe und Support",
    supportDescription: "Hilfe bei Zugang, Einladungen und Abonnements.",
    supportBody: "Hinweise findest du auf der Supportseite. Beschreibe Gerät, App-Version und das Problem, ohne Passwörter oder Einladungstoken weiterzugeben.",
    supportContactPending: "Ein direkter Supportkontakt ist noch nicht eingerichtet.",
    troubleshootingTitle: "Was du prüfen kannst",
    supportTips: [
      { title: "Kontozugang", body: "Verwende die E-Mail-Adresse oder das Google-Konto deiner Registrierung. Bei einem E-Mail-Konto kannst du das Passwort zurücksetzen." },
      { title: "Haushaltseinladungen", body: "Melde dich mit der eingeladenen E-Mail-Adresse an und bestätige sie. Bitte einen Eigentümer um eine neue Einladung, wenn der Link abgelaufen oder widerrufen ist." },
      { title: "Abonnementdetails", body: "Prüfe den ausgewählten Haushalt und lade die Abrechnungsdetails erneut. Verwalte bestehende Käufe mit dem berechtigten Käuferkonto." },
    ],
    aboutTitle: "Über Plantie",
    aboutDescription: "Pflanzenpflege, Datenschutz und deine App-Version.",
    aboutIntro: "Plantie organisiert die Pflanzenpflege mit gemeinsamen Haushaltseinträgen und KI-Hinweisen bei Bedarf.",
    aboutFeatures: ["Pflanzenprofile und Fotos", "Gießpläne und Pflegeeinträge", "KI-Pflegetipps und Analysen zur Pflanzengesundheit", "Pflanzen-QR-Etiketten und PDF-Export", "Gemeinsame Premium-Haushalte"],
    versionLabel: "App-Version",
    versionLoading: "App-Version wird geladen…",
    versionUnavailable: "App-Version nicht verfügbar",
    privacySummary: "Konto-, Haushalts- und Pflanzendaten werden bei Supabase gespeichert. Fotos und Eingaben können für KI-Hinweise verarbeitet werden. Details findest du in der Datenschutzerklärung.",
  },
  fr: {
    inviteInputLabel: "Lien ou jeton d’invitation",
    subscriptionTermsLabel: "Conditions d’abonnement",
    heroBody: "Prenez soin de vos plantes, comprenez leurs besoins et organisez leur entretien ensemble.",
    tagline: "Vos plantes. Votre foyer. L'entretien au quotidien.",
    signedOutTitle: "Vous êtes déconnecté",
    signedOutBody: "Connectez-vous pour retrouver vos plantes et foyers, ou créez un compte pour commencer.",
    accountDescription: "Connexion, création de compte ou réinitialisation du mot de passe.",
    householdDescription: "Plantes partagées, rôles des membres et invitations au foyer.",
    householdIntro: "Un foyer rassemble ses plantes, son historique d'entretien et ses membres au même endroit.",
    householdFeatures: [
      { title: "Entretenir ensemble", body: "Les fiches des plantes, photos, arrosages et notes restent dans le même foyer." },
      { title: "Partager par invitation", body: "Les Propriétaires Premium peuvent inviter une personne par email, même avant la création de son compte Plantie." },
      { title: "Des rôles clairs", body: "Les Propriétaires et Observateurs actifs gèrent les plantes et l'entretien. Seuls les Propriétaires administrent le foyer." },
      { title: "Plusieurs foyers", body: "Passez d'un foyer à l'autre. Chacun conserve ses plantes, ses membres et son abonnement." },
    ],
    ownerTitle: "Propriétaire",
    ownerBody: "Gère les plantes et l'entretien, modifie le foyer, invite ou retire des Observateurs et gère l'abonnement avec le compte autorisé pour la facturation.",
    viewerTitle: "Observateur",
    viewerBody: "Les Observateurs actifs peuvent ajouter, modifier et supprimer des plantes, noter les soins et utiliser l'IA et les outils QR. Ils ne peuvent pas modifier le foyer, gérer les membres ou la facturation.",
    sharingTitle: "Capacité du foyer",
    freeSharing: (count) => `Free : ${count} place occupée dans un foyer standard, sans partage ni invitations.`,
    premiumSharing: (count) => `Premium : jusqu'à ${count} places occupées, Propriétaire compris.`,
    occupiedSlotsBody: "Les membres actifs et les invitations valides en attente occupent une place. Les invitations refusées, révoquées ou expirées libèrent leur place.",
    multiHouseholdBody: "Rejoindre un autre foyer conserve vos foyers existants. Premium appartient à un foyer et couvre ses membres actifs ; vos autres foyers ne changent pas de plan.",
    inviteExplanation: "Ouvrez le lien et connectez-vous, ou créez un compte, avec l'email invité. Vérifiez cet email, consultez l'invitation, puis acceptez-la ou refusez-la. Les invitations expirent après sept jours.",
    subscriptionDescription: "Comparez Free et Premium pour le foyer avant la connexion.",
    subscriptionIntro: "Les plans s'appliquent à un foyer. Premium mensuel et annuel offrent les mêmes fonctions pour les plantes et leur entretien.",
    pricesAfterSignIn: "Connectez-vous pour charger les prix actuels et les options d'achat de votre plateforme. Les prix disponibles proviennent du prestataire de facturation.",
    freePlanBody: "Commencez sans abonnement et prenez soin de votre collection de plantes.",
    premiumPlanBody: "Des limites plus élevées et le partage pour tous les membres actifs du foyer abonné.",
    freePlants: (count) => `Jusqu'à ${count} plantes par foyer`,
    freeScans: (count) => `${count} analyses IA de la santé des plantes par foyer et par mois`,
    freeQr: (count) => `Exportez jusqu'à ${count} étiquettes QR de plantes en PDF`,
    freeCareRefresh: (count) => `${count} actualisation des conseils IA par plante et par jour ; la création initiale est distincte`,
    premiumPlants: "Plantes illimitées",
    premiumScans: "Analyses IA de la santé des plantes illimitées",
    premiumQr: "Exportez les étiquettes QR de toutes les plantes du foyer",
    premiumCare: "Actualisations des conseils IA illimitées",
    ownerBillingBody: "Seuls les Propriétaires gèrent les achats et la résiliation. Certains abonnements exigent le compte ayant effectué l'achat. Les Observateurs actifs bénéficient de Premium sans gérer la facturation.",
    cancellationBody: "La résiliation du renouvellement conserve Premium jusqu'à la fin de la période payée. Le foyer passe ensuite à Free et l'accès des Observateurs est suspendu ; les données des plantes sont conservées.",
    historyTitle: "Facturation et historique",
    historyBody: "Après connexion, les Propriétaires et Observateurs actifs peuvent lire l'historique d'abonnement de leur foyer. Seuls les Propriétaires gèrent la facturation.",
    languageDescription: "Choisissez la langue de l'interface et des nouvelles réponses IA.",
    languageBody: "Les changements sont immédiats et enregistrés sur cet appareil. Les nouveaux conseils IA utilisent la langue choisie ; les textes déjà enregistrés restent inchangés.",
    languagePreviewLabel: "Aperçu de l'interface",
    supportTitle: "Aide et assistance",
    supportDescription: "Aide pour l'accès, les invitations et les abonnements.",
    supportBody: "Consultez la page d'assistance. Décrivez votre appareil, la version de l'application et le problème, sans communiquer de mot de passe ni de jeton d'invitation.",
    supportContactPending: "Aucun contact direct d'assistance n'est encore configuré.",
    troubleshootingTitle: "Points à vérifier",
    supportTips: [
      { title: "Accès au compte", body: "Utilisez l'email ou le compte Google choisi à l'inscription. Pour un compte avec email et mot de passe, utilisez la réinitialisation du mot de passe." },
      { title: "Invitations au foyer", body: "Connectez-vous avec l'email invité et vérifiez-le. Demandez une nouvelle invitation à un Propriétaire si le lien a expiré ou a été révoqué." },
      { title: "Détails de l'abonnement", body: "Vérifiez le foyer sélectionné et réessayez de charger la facturation. Gérez un achat existant avec le compte autorisé ayant effectué l'achat." },
    ],
    aboutTitle: "À propos de Plantie",
    aboutDescription: "Outils d'entretien, confidentialité et version de l'application.",
    aboutIntro: "Plantie organise l'entretien des plantes grâce aux données partagées du foyer et aux conseils IA lorsque vous en avez besoin.",
    aboutFeatures: ["Fiches des plantes et photos", "Calendriers d'arrosage et historique d'entretien", "Conseils IA et analyses de la santé des plantes", "Étiquettes QR de plantes et export PDF", "Partage du foyer avec Premium"],
    versionLabel: "Version de l'application",
    versionLoading: "Chargement de la version…",
    versionUnavailable: "Version de l'application indisponible",
    privacySummary: "Les données du compte, du foyer et des plantes sont stockées avec Supabase. Les photos et requêtes peuvent être traitées pour les conseils IA. Consultez la politique de confidentialité pour les détails.",
  },
  es: {
    inviteInputLabel: "Enlace o token de invitación",
    subscriptionTermsLabel: "Condiciones de suscripción",
    heroBody: "Cuida tus plantas, conoce sus necesidades y organiza los cuidados en compañía.",
    tagline: "Tus plantas. Tu hogar. Cuidados diarios.",
    signedOutTitle: "No has iniciado sesión",
    signedOutBody: "Inicia sesión para abrir tus plantas y hogares, o crea una cuenta para empezar.",
    accountDescription: "Iniciar sesión, crear una cuenta o restablecer la contraseña.",
    householdDescription: "Plantas compartidas, roles e invitaciones al hogar.",
    householdIntro: "Un hogar reúne sus plantas, registros de cuidados y miembros en un solo lugar.",
    householdFeatures: [
      { title: "Cuidar en compañía", body: "Las fichas de plantas, fotos, riegos y notas de cuidados pertenecen al mismo hogar." },
      { title: "Compartir con invitación", body: "Los Propietarios Premium pueden invitar por email, incluso antes de que la persona tenga una cuenta Plantie." },
      { title: "Roles claros", body: "Los Propietarios y Observadores activos gestionan plantas y cuidados. Solo los Propietarios administran el hogar." },
      { title: "Varios hogares", body: "Cambia entre tus hogares. Cada uno conserva sus plantas, miembros y suscripción." },
    ],
    ownerTitle: "Propietario",
    ownerBody: "Gestiona plantas y cuidados, edita el hogar, invita o elimina Observadores y gestiona la suscripción con la cuenta autorizada para la facturación.",
    viewerTitle: "Observador",
    viewerBody: "Los Observadores activos pueden añadir, editar y eliminar plantas, registrar cuidados y usar la IA y los códigos QR. No pueden editar el hogar, gestionar miembros ni cambiar la facturación.",
    sharingTitle: "Capacidad del hogar",
    freeSharing: (count) => `Free: ${count} plaza ocupada en un hogar estándar, sin compartir ni invitar.`,
    premiumSharing: (count) => `Premium: hasta ${count} plazas ocupadas, incluido el Propietario.`,
    occupiedSlotsBody: "Los miembros activos y las invitaciones pendientes válidas ocupan una plaza. Las invitaciones rechazadas, revocadas o caducadas liberan su plaza.",
    multiHouseholdBody: "Al unirte a otro hogar conservas los existentes. Premium pertenece a un hogar y cubre a sus miembros activos; no mejora el plan de tus otros hogares.",
    inviteExplanation: "Abre el enlace e inicia sesión, o crea una cuenta, con el email invitado. Verifica ese email, revisa la invitación y acéptala o recházala. Las invitaciones caducan a los siete días.",
    subscriptionDescription: "Compara Free y Premium para el hogar antes de iniciar sesión.",
    subscriptionIntro: "Los planes se aplican a un hogar. Premium mensual y anual ofrecen las mismas funciones para plantas y cuidados.",
    pricesAfterSignIn: "Inicia sesión para cargar los precios actuales y las opciones de compra de tu plataforma. El proveedor de facturación facilita los precios disponibles.",
    freePlanBody: "Empieza sin suscripción y cuida tu propia colección de plantas.",
    premiumPlanBody: "Límites de cuidados más amplios y acceso compartido para todos los miembros activos del hogar suscrito.",
    freePlants: (count) => `Hasta ${count} plantas por hogar`,
    freeScans: (count) => `${count} análisis de salud de plantas con IA por hogar al mes`,
    freeQr: (count) => `Exporta hasta ${count} etiquetas QR de plantas en PDF`,
    freeCareRefresh: (count) => `${count} actualización de consejos IA por planta al día; la generación inicial es independiente`,
    premiumPlants: "Plantas ilimitadas",
    premiumScans: "Análisis de salud de plantas con IA ilimitados",
    premiumQr: "Exporta etiquetas QR de todas las plantas del hogar",
    premiumCare: "Actualizaciones de consejos IA ilimitadas",
    ownerBillingBody: "Solo los Propietarios gestionan compras y cancelaciones. Algunas suscripciones requieren la cuenta que realizó la compra. Los Observadores activos usan Premium sin gestionar la facturación.",
    cancellationBody: "Cancelar la renovación mantiene Premium hasta el final del periodo pagado. Después el hogar pasa a Free y se suspende el acceso de los Observadores; los datos de las plantas se conservan.",
    historyTitle: "Facturación e historial",
    historyBody: "Tras iniciar sesión, los Propietarios y Observadores activos pueden consultar el historial de suscripción del hogar. Solo los Propietarios gestionan la facturación.",
    languageDescription: "Elige el idioma de la interfaz y las nuevas respuestas de IA.",
    languageBody: "Los cambios se aplican al momento y se guardan en este dispositivo. Los nuevos consejos de IA usan el idioma seleccionado; los textos guardados no se traducen de nuevo.",
    languagePreviewLabel: "Vista previa de la interfaz",
    supportTitle: "Ayuda y soporte",
    supportDescription: "Ayuda con el acceso, las invitaciones y las suscripciones.",
    supportBody: "Consulta la página de soporte. Al describir un problema, indica el dispositivo, la versión de la aplicación y qué ocurrió, sin contraseñas ni tokens de invitación.",
    supportContactPending: "Todavía no hay un contacto de soporte directo configurado.",
    troubleshootingTitle: "Qué comprobar",
    supportTips: [
      { title: "Acceso a la cuenta", body: "Usa el mismo email o cuenta de Google del registro. Si te registraste con email y contraseña, puedes restablecer la contraseña." },
      { title: "Invitaciones al hogar", body: "Inicia sesión con el email invitado y verifícalo. Pide una nueva invitación a un Propietario si el enlace ha caducado o fue revocado." },
      { title: "Detalles de la suscripción", body: "Comprueba el hogar seleccionado y vuelve a cargar la facturación. Gestiona una compra existente con la cuenta autorizada que la realizó." },
    ],
    aboutTitle: "Acerca de Plantie",
    aboutDescription: "Herramientas de cuidados, privacidad y versión de la aplicación.",
    aboutIntro: "Plantie organiza el cuidado de las plantas con registros compartidos del hogar y consejos de IA cuando los necesitas.",
    aboutFeatures: ["Fichas de plantas y fotos", "Planes de riego y registros de cuidados", "Consejos IA y análisis de salud de plantas", "Etiquetas QR de plantas y exportación PDF", "Hogares compartidos con Premium"],
    versionLabel: "Versión de la aplicación",
    versionLoading: "Cargando la versión…",
    versionUnavailable: "Versión de la aplicación no disponible",
    privacySummary: "Los datos de la cuenta, el hogar y las plantas se almacenan en Supabase. Las fotos y solicitudes pueden procesarse para los consejos de IA. Consulta los detalles en la política de privacidad.",
  },
};

export const loggedOutMenuCopy = (language: PlantieLanguage): LoggedOutMenuCopy => copy[language];
