import type { PlantieLanguage } from "./onboarding.js";

type Copy = {
  subtitle: string;
  currentPlan: string;
  householdPremium: string;
  premiumBody: string;
  ownerOnly: string;
  billingDetailsUnavailable: string;
  planDetails: string;
  collapseDetails: string;
  included: string;
  members: (used: number, max: number) => string;
  slotsLabel: string;
  managementAccountRequired: string;
  activeUntil: string;
  periodEnds: string;
  cancelledNotice: string;
  suspended: (count: number) => string;
  availablePlans: string;
  plansApply: string;
  freeMembers: string;
  premiumMembers: string;
  history: string;
  historyBody: string;
  historyUnavailable: string;
  historyEmpty: string;
  historyUpdated: string;
  historyEvents: Record<string, string>;
  changePlan: string;
  resumeSubscription: string;
  cancelImpact: string;
  sharingRequiresPremium: string;
  memberLimitReached: string;
  inactive: string;
  entitlementUnknown: string;
  freeQrLimit: string;
  purchaseLinkedElsewhere: string;
};

const copy: Record<PlantieLanguage, Copy> = {
  en: {
    subtitle: "Manage your household plan, billing, and access.", currentPlan: "Current household plan",
    householdPremium: "Household Premium", included: "Included for all household members",
    premiumBody: "All active household members can use Premium plant features and care tools.",
    ownerOnly: "Only household owners can manage this subscription.",
    billingDetailsUnavailable: "Store billing details are unavailable. Your household plan is confirmed by Plantie; retry to load billing details.",
    planDetails: "View plan details", collapseDetails: "Hide plan details",
    members: (used, max) => `${used} / ${max}`, slotsLabel: "Occupied household slots",
    managementAccountRequired: "Manage billing using the owner's account that purchased this household subscription.",
    activeUntil: "Active until", periodEnds: "Current period ends",
    cancelledNotice: "Premium stays active until the date above. Then your household switches to Free and Viewer access is suspended.",
    suspended: (count) => `${count} Viewer members are inactive until Premium is restored.`,
    availablePlans: "Available plans", plansApply: "Plan changes apply to the entire household.",
    freeMembers: "1 household member · No household sharing", premiumMembers: "Up to 3 household members",
    history: "Billing & history", historyBody: "Subscription changes for this household.",
    historyUnavailable: "Billing history is unavailable right now.", historyEmpty: "No billing changes recorded yet.",
    historyUpdated: "Subscription updated",
    historyEvents: { subscription_started: "Subscription started", upgraded: "Plan upgraded", downgraded: "Plan downgraded",
      renewed: "Subscription renewed", cancelled: "Renewal cancelled", resumed: "Renewal resumed", expired: "Subscription expired",
      switched_to_free: "Switched to Free", payment_failed: "Payment failed" },
    changePlan: "Change plan", resumeSubscription: "Resume subscription",
    cancelImpact: "After Premium ends, the household will switch to Free, sharing will stop, and Viewer members will lose household access until Premium is restored.",
    sharingRequiresPremium: "Household sharing requires Premium. Upgrade to invite family members.",
    memberLimitReached: "Household member limit reached. Premium households can have up to 3 members.",
    inactive: "Inactive", entitlementUnknown: "Household subscription could not be confirmed. Try again shortly.",
    freeQrLimit: "Free households can export up to 10 QR labels.",
    purchaseLinkedElsewhere: "Your subscription is linked to another household. That household keeps Premium access; this household remains on Free.",
  },
  sk: {
    subtitle: "Spravujte plán, platby a prístup svojej domácnosti.", currentPlan: "Aktuálny plán domácnosti",
    householdPremium: "Premium pre domácnosť", included: "Pre všetkých členov domácnosti",
    premiumBody: "Všetci aktívni členovia domácnosti môžu používať Premium funkcie pre rastliny a starostlivosť.",
    ownerOnly: "Toto predplatné môžu spravovať iba vlastníci domácnosti.",
    billingDetailsUnavailable: "Údaje o platbe z obchodu nie sú dostupné. Plán domácnosti je potvrdený v Plantie; skúste znova načítať platobné údaje.",
    planDetails: "Zobraziť podrobnosti plánu", collapseDetails: "Skryť podrobnosti plánu",
    members: (used, max) => `${used} / ${max}`, slotsLabel: "Obsadené miesta v domácnosti",
    managementAccountRequired: "Platby spravujte cez účet vlastníka, ktorý kúpil predplatné tejto domácnosti.",
    activeUntil: "Aktívne do", periodEnds: "Aktuálne obdobie končí",
    cancelledNotice: "Premium zostane aktívne do uvedeného dátumu. Potom domácnosť prejde na bezplatný plán a prístup členov s rolou Pozorovateľ sa pozastaví.",
    suspended: (count) => `Počet pozorovateľov s pozastaveným prístupom: ${count}. Prístup sa obnoví po obnovení Premium.`,
    availablePlans: "Dostupné plány", plansApply: "Zmeny plánu platia pre celú domácnosť.",
    freeMembers: "1 člen domácnosti · Bez zdieľania", premiumMembers: "Až 3 členovia domácnosti",
    history: "Platby a história", historyBody: "Zmeny predplatného tejto domácnosti.",
    historyUnavailable: "História platieb momentálne nie je dostupná.", historyEmpty: "Zatiaľ nie sú zaznamenané žiadne zmeny.",
    historyUpdated: "Predplatné aktualizované",
    historyEvents: { subscription_started: "Predplatné začalo", upgraded: "Prechod na vyšší plán", downgraded: "Prechod na nižší plán",
      renewed: "Predplatné obnovené", cancelled: "Automatické obnovenie zrušené", resumed: "Automatické obnovenie zapnuté",
      expired: "Predplatné skončilo", switched_to_free: "Prechod na bezplatný plán", payment_failed: "Platba zlyhala" },
    changePlan: "Zmeniť plán", resumeSubscription: "Obnoviť predplatné",
    cancelImpact: "Po skončení Premium prejde domácnosť na bezplatný plán, zdieľanie sa zastaví a členovia s rolou Pozorovateľ stratia prístup, kým sa Premium neobnoví.",
    sharingRequiresPremium: "Zdieľanie domácnosti vyžaduje Premium. Ak chcete pozvať rodinu, prejdite na Premium.",
    memberLimitReached: "Limit členov bol dosiahnutý. Premium domácnosť môže mať najviac 3 členov.",
    inactive: "Neaktívny", entitlementUnknown: "Predplatné domácnosti sa nepodarilo overiť. Skúste to znova o chvíľu.",
    freeQrLimit: "Bezplatná domácnosť môže exportovať najviac 10 QR štítkov.",
    purchaseLinkedElsewhere: "Vaše predplatné je priradené k inej domácnosti. Tá si ponecháva Premium; táto domácnosť zostáva na bezplatnom pláne.",
  },
  de: {
    subtitle: "Verwalte Tarif, Abrechnung und Zugriff deines Haushalts.", currentPlan: "Aktueller Haushaltstarif",
    householdPremium: "Haushalt Premium", included: "Für alle Haushaltsmitglieder enthalten",
    premiumBody: "Alle aktiven Haushaltsmitglieder können Premium-Funktionen für Pflanzen und Pflege nutzen.",
    ownerOnly: "Nur Haushaltsinhaber können dieses Abonnement verwalten.",
    billingDetailsUnavailable: "Abrechnungsdaten des Stores sind nicht verfügbar. Der Haushaltsplan ist von Plantie bestätigt; versuche, die Abrechnungsdaten erneut zu laden.",
    planDetails: "Tarifdetails anzeigen", collapseDetails: "Tarifdetails ausblenden",
    members: (used, max) => `${used} / ${max}`, slotsLabel: "Belegte Haushaltsplätze",
    managementAccountRequired: "Verwalte die Abrechnung über das Inhaberkonto, das dieses Haushaltsabo gekauft hat.",
    activeUntil: "Aktiv bis", periodEnds: "Aktueller Zeitraum endet",
    cancelledNotice: "Premium bleibt bis zum angegebenen Datum aktiv. Danach wechselt der Haushalt zu Free und der Zugriff der Betrachter wird ausgesetzt.",
    suspended: (count) => `${count} Betrachter sind inaktiv, bis Premium wiederhergestellt wird.`,
    availablePlans: "Verfügbare Tarife", plansApply: "Tarifänderungen gelten für den gesamten Haushalt.",
    freeMembers: "1 Haushaltsmitglied · Keine Freigabe", premiumMembers: "Bis zu 3 Haushaltsmitglieder",
    history: "Abrechnung & Verlauf", historyBody: "Aboänderungen dieses Haushalts.",
    historyUnavailable: "Der Abrechnungsverlauf ist derzeit nicht verfügbar.", historyEmpty: "Noch keine Aboänderungen erfasst.",
    historyUpdated: "Abonnement aktualisiert",
    historyEvents: { subscription_started: "Abonnement gestartet", upgraded: "Tarif erweitert", downgraded: "Tarif reduziert",
      renewed: "Abonnement verlängert", cancelled: "Verlängerung gekündigt", resumed: "Verlängerung fortgesetzt",
      expired: "Abonnement abgelaufen", switched_to_free: "Zu Free gewechselt", payment_failed: "Zahlung fehlgeschlagen" },
    changePlan: "Tarif ändern", resumeSubscription: "Abo fortsetzen",
    cancelImpact: "Nach dem Ende von Premium wechselt der Haushalt zu Free. Die Freigabe endet und Betrachter verlieren den Zugriff, bis Premium wiederhergestellt wird.",
    sharingRequiresPremium: "Haushaltsfreigabe erfordert Premium. Upgrade, um Familienmitglieder einzuladen.",
    memberLimitReached: "Mitgliederlimit erreicht. Premium-Haushalte erlauben bis zu 3 Mitglieder.",
    inactive: "Inaktiv", entitlementUnknown: "Der Haushaltstarif konnte nicht bestätigt werden. Bitte versuche es später erneut.",
    freeQrLimit: "Free-Haushalte können bis zu 10 QR-Etiketten exportieren.",
    purchaseLinkedElsewhere: "Dein Abo ist mit einem anderen Haushalt verknüpft. Dieser behält Premium; dieser Haushalt bleibt im Free-Tarif.",
  },
  fr: {
    subtitle: "Gérez l'offre, la facturation et l'accès de votre foyer.", currentPlan: "Offre actuelle du foyer",
    householdPremium: "Premium familial", included: "Inclus pour tous les membres du foyer",
    premiumBody: "Tous les membres actifs du foyer peuvent utiliser les fonctions Premium pour les plantes.",
    ownerOnly: "Seuls les propriétaires du foyer peuvent gérer cet abonnement.",
    billingDetailsUnavailable: "Les informations de facturation du store sont indisponibles. Plantie a confirmé l'offre du foyer ; réessayez pour charger la facturation.",
    planDetails: "Voir les détails de l’offre", collapseDetails: "Masquer les détails de l’offre",
    members: (used, max) => `${used} / ${max}`, slotsLabel: "Places occupées dans le foyer",
    managementAccountRequired: "Gérez la facturation avec le compte du propriétaire qui a acheté cet abonnement familial.",
    activeUntil: "Actif jusqu'au", periodEnds: "Fin de la période en cours",
    cancelledNotice: "Premium reste actif jusqu'à la date indiquée. Ensuite, le foyer passe à l'offre gratuite et l'accès des lecteurs est suspendu.",
    suspended: (count) => `${count} lecteurs sont inactifs jusqu'au rétablissement de Premium.`,
    availablePlans: "Offres disponibles", plansApply: "Les changements d'offre s'appliquent à tout le foyer.",
    freeMembers: "1 membre du foyer · Aucun partage", premiumMembers: "Jusqu'à 3 membres du foyer",
    history: "Facturation et historique", historyBody: "Changements d'abonnement de ce foyer.",
    historyUnavailable: "L'historique de facturation est indisponible pour le moment.", historyEmpty: "Aucun changement enregistré pour le moment.",
    historyUpdated: "Abonnement mis à jour",
    historyEvents: { subscription_started: "Abonnement commencé", upgraded: "Passage à une offre supérieure", downgraded: "Passage à une offre inférieure",
      renewed: "Abonnement renouvelé", cancelled: "Renouvellement annulé", resumed: "Renouvellement réactivé",
      expired: "Abonnement expiré", switched_to_free: "Passage à l’offre gratuite", payment_failed: "Échec du paiement" },
    changePlan: "Changer d'offre", resumeSubscription: "Réactiver l'abonnement",
    cancelImpact: "À la fin de Premium, le foyer passe à l'offre gratuite, le partage cesse et les lecteurs perdent l'accès jusqu'au rétablissement de Premium.",
    sharingRequiresPremium: "Le partage familial nécessite Premium. Passez à Premium pour inviter votre famille.",
    memberLimitReached: "Limite de membres atteinte. Un foyer Premium peut compter jusqu'à 3 membres.",
    inactive: "Inactif", entitlementUnknown: "L'abonnement du foyer n'a pas pu être confirmé. Réessayez dans un instant.",
    freeQrLimit: "Les foyers gratuits peuvent exporter jusqu'à 10 étiquettes QR.",
    purchaseLinkedElsewhere: "Votre abonnement est lié à un autre foyer. Ce foyer conserve Premium ; celui-ci reste sur l'offre gratuite.",
  },
  es: {
    subtitle: "Gestiona el plan, la facturación y el acceso de tu hogar.", currentPlan: "Plan actual del hogar",
    householdPremium: "Premium del hogar", included: "Incluido para todos los miembros del hogar",
    premiumBody: "Todos los miembros activos del hogar pueden usar las funciones Premium para plantas.",
    ownerOnly: "Solo los propietarios del hogar pueden gestionar esta suscripción.",
    billingDetailsUnavailable: "Los datos de facturación de la tienda no están disponibles. Plantie ha confirmado el plan del hogar; vuelve a intentar cargar la facturación.",
    planDetails: "Ver detalles del plan", collapseDetails: "Ocultar detalles del plan",
    members: (used, max) => `${used} / ${max}`, slotsLabel: "Plazas ocupadas en el hogar",
    managementAccountRequired: "Gestiona la facturación con la cuenta del propietario que compró esta suscripción del hogar.",
    activeUntil: "Activo hasta", periodEnds: "Termina el período actual",
    cancelledNotice: "Premium sigue activo hasta la fecha indicada. Después, el hogar pasa a Gratis y se suspende el acceso de los lectores.",
    suspended: (count) => `${count} lectores están inactivos hasta que se restaure Premium.`,
    availablePlans: "Planes disponibles", plansApply: "Los cambios de plan se aplican a todo el hogar.",
    freeMembers: "1 miembro del hogar · Sin uso compartido", premiumMembers: "Hasta 3 miembros del hogar",
    history: "Facturación e historial", historyBody: "Cambios de suscripción de este hogar.",
    historyUnavailable: "El historial de facturación no está disponible ahora.", historyEmpty: "Aún no hay cambios registrados.",
    historyUpdated: "Suscripción actualizada",
    historyEvents: { subscription_started: "Suscripción iniciada", upgraded: "Cambio a un plan superior", downgraded: "Cambio a un plan inferior",
      renewed: "Suscripción renovada", cancelled: "Renovación cancelada", resumed: "Renovación reanudada",
      expired: "Suscripción vencida", switched_to_free: "Cambio al plan gratuito", payment_failed: "Pago fallido" },
    changePlan: "Cambiar de plan", resumeSubscription: "Reanudar suscripción",
    cancelImpact: "Cuando termine Premium, el hogar pasará a Gratis, dejará de compartirse y los lectores perderán acceso hasta que se restaure Premium.",
    sharingRequiresPremium: "Compartir el hogar requiere Premium. Mejora el plan para invitar a tu familia.",
    memberLimitReached: "Límite de miembros alcanzado. Los hogares Premium admiten hasta 3 miembros.",
    inactive: "Inactivo", entitlementUnknown: "No se pudo confirmar la suscripción del hogar. Vuelve a intentarlo pronto.",
    freeQrLimit: "Los hogares gratuitos pueden exportar hasta 10 etiquetas QR.",
    purchaseLinkedElsewhere: "Tu suscripción está vinculada a otro hogar. Ese hogar conserva Premium; este sigue en el plan gratuito.",
  },
};

export const householdSubscriptionCopy = (language: PlantieLanguage | null | undefined): Copy => copy[language ?? "en"] ?? copy.en;
