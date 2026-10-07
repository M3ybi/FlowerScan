import type { PlantieLanguage } from "./onboarding";
import type { SubscriptionHistoryCategory, SubscriptionHistoryItem, SubscriptionHistoryPlanKey, SubscriptionHistoryType } from "./subscriptionHistoryModel";

type Copy = {
  title: string; subtitle: string; filterLabel: string; filters: Record<"all" | SubscriptionHistoryCategory, string>;
  loading: string; emptyTitle: string; emptyBody: string; filteredEmptyTitle: string; filteredEmptyBody: string;
  error: string; retry: string; showOlder: string; loadingOlder: string; olderError: string;
  titles: Record<SubscriptionHistoryType, string>; descriptions: Record<SubscriptionHistoryType, string>;
  planNames: Record<SubscriptionHistoryPlanKey, string>; changedYearly: string; changedMonthly: string;
  startedPlan: (plan: string) => string; changedPlan: (plan: string) => string; changedFromTo: (previous: string, next: string) => string;
  renewedMonthly: string; renewedYearly: string;
  badges: { success: string; failed: string; warning: string; info: string; expired: string; planChange: string; cancelled: string; refunded: string };
};

const copy: Record<PlantieLanguage, Copy> = {
  en: {
    title: "Billing & history", subtitle: "Subscription changes for this household.", filterLabel: "Filter billing history",
    filters: { all: "All", billing: "Billing", plan_change: "Plan changes", renewal: "Renewal" },
    loading: "Loading billing history…", emptyTitle: "No billing history yet", emptyBody: "Subscription changes and billing events for this household will appear here.",
    filteredEmptyTitle: "No activity in this category", filteredEmptyBody: "Choose another filter to see more household activity.",
    error: "Couldn't load billing history.", retry: "Try again", showOlder: "Show older activity", loadingOlder: "Loading older activity…", olderError: "Couldn't load older activity.",
    titles: { subscription_started: "Subscription started", renewed: "Subscription renewed", upgraded: "Plan changed", downgraded: "Plan changed", plan_changed: "Plan changed", cancelled: "Renewal cancelled", resumed: "Renewal resumed", expired: "Subscription expired", switched_to_free: "Switched to Free", payment_failed: "Payment issue", payment_succeeded: "Payment successful", refund: "Payment refunded" },
    descriptions: { subscription_started: "Your household subscription started.", renewed: "Your household subscription renewed.", upgraded: "The subscription plan for your household changed.", downgraded: "The subscription plan for your household changed.", plan_changed: "The subscription plan for your household changed.", cancelled: "Automatic renewal was cancelled for your household subscription.", resumed: "Automatic renewal was resumed for your household subscription.", expired: "Your household's paid subscription ended.", switched_to_free: "Your household switched to the Free plan.", payment_failed: "We couldn't process your subscription payment.", payment_succeeded: "Your household subscription payment was successful.", refund: "A payment for your household subscription was refunded." },
    planNames: { free: "Free", premium_monthly: "Household Premium (Monthly)", premium_yearly: "Household Premium (Yearly)" }, changedYearly: "Changed to Yearly", changedMonthly: "Changed to Monthly",
    startedPlan: (plan) => `Your household started ${plan}.`, changedPlan: (plan) => `Your household changed to ${plan}.`, changedFromTo: (previous, next) => `Switched from ${previous} to ${next}.`,
    renewedMonthly: "Your Household Premium plan renewed for another month.", renewedYearly: "Your Household Premium plan renewed for another year.",
    badges: { success: "Successful", failed: "Failed", warning: "Attention", info: "Updated", expired: "Expired", planChange: "Plan change", cancelled: "Cancelled", refunded: "Refunded" },
  },
  sk: {
    title: "Platby a história", subtitle: "Zmeny predplatného tejto domácnosti.", filterLabel: "Filtrovať históriu platieb",
    filters: { all: "Všetko", billing: "Platby", plan_change: "Zmeny plánu", renewal: "Obnovenie" },
    loading: "Načítavam históriu platieb…", emptyTitle: "Zatiaľ bez histórie platieb", emptyBody: "Tu sa zobrazia zmeny predplatného a platby tejto domácnosti.",
    filteredEmptyTitle: "V tejto kategórii zatiaľ nie je aktivita", filteredEmptyBody: "Vyberte iný filter a pozrite si ďalšiu aktivitu domácnosti.",
    error: "Históriu platieb sa nepodarilo načítať.", retry: "Skúsiť znova", showOlder: "Zobraziť staršiu aktivitu", loadingOlder: "Načítavam staršiu aktivitu…", olderError: "Staršiu aktivitu sa nepodarilo načítať.",
    titles: { subscription_started: "Predplatné začalo", renewed: "Predplatné obnovené", upgraded: "Plán zmenený", downgraded: "Plán zmenený", plan_changed: "Plán zmenený", cancelled: "Automatické obnovenie zrušené", resumed: "Automatické obnovenie zapnuté", expired: "Predplatné skončilo", switched_to_free: "Prechod na bezplatný plán", payment_failed: "Problém s platbou", payment_succeeded: "Platba úspešná", refund: "Platba vrátená" },
    descriptions: { subscription_started: "Predplatné vašej domácnosti začalo.", renewed: "Predplatné vašej domácnosti sa obnovilo.", upgraded: "Plán predplatného vašej domácnosti sa zmenil.", downgraded: "Plán predplatného vašej domácnosti sa zmenil.", plan_changed: "Plán predplatného vašej domácnosti sa zmenil.", cancelled: "Automatické obnovenie predplatného domácnosti bolo zrušené.", resumed: "Automatické obnovenie predplatného domácnosti bolo znova zapnuté.", expired: "Platené predplatné vašej domácnosti skončilo.", switched_to_free: "Vaša domácnosť prešla na bezplatný plán.", payment_failed: "Platbu za predplatné sa nepodarilo spracovať.", payment_succeeded: "Platba za predplatné domácnosti bola úspešná.", refund: "Platba za predplatné domácnosti bola vrátená." },
    planNames: { free: "bezplatný plán", premium_monthly: "Premium pre domácnosť (mesačne)", premium_yearly: "Premium pre domácnosť (ročne)" }, changedYearly: "Prechod na ročný plán", changedMonthly: "Prechod na mesačný plán",
    startedPlan: (plan) => `Vaša domácnosť začala používať ${plan}.`, changedPlan: (plan) => `Vaša domácnosť prešla na ${plan}.`, changedFromTo: (previous, next) => `Zmena z plánu ${previous} na ${next}.`,
    renewedMonthly: "Premium plán vašej domácnosti sa obnovil na ďalší mesiac.", renewedYearly: "Premium plán vašej domácnosti sa obnovil na ďalší rok.",
    badges: { success: "Úspešné", failed: "Zlyhalo", warning: "Upozornenie", info: "Aktualizované", expired: "Skončené", planChange: "Zmena plánu", cancelled: "Zrušené", refunded: "Vrátené" },
  },
  de: {
    title: "Abrechnung & Verlauf", subtitle: "Aboänderungen dieses Haushalts.", filterLabel: "Abrechnungsverlauf filtern",
    filters: { all: "Alle", billing: "Abrechnung", plan_change: "Tarifänderungen", renewal: "Verlängerung" },
    loading: "Abrechnungsverlauf wird geladen…", emptyTitle: "Noch kein Abrechnungsverlauf", emptyBody: "Hier erscheinen Aboänderungen und Abrechnungsereignisse dieses Haushalts.",
    filteredEmptyTitle: "Keine Aktivität in dieser Kategorie", filteredEmptyBody: "Wähle einen anderen Filter für weitere Haushaltsaktivitäten.",
    error: "Der Abrechnungsverlauf konnte nicht geladen werden.", retry: "Erneut versuchen", showOlder: "Ältere Aktivitäten anzeigen", loadingOlder: "Ältere Aktivitäten werden geladen…", olderError: "Ältere Aktivitäten konnten nicht geladen werden.",
    titles: { subscription_started: "Abonnement gestartet", renewed: "Abonnement verlängert", upgraded: "Tarif geändert", downgraded: "Tarif geändert", plan_changed: "Tarif geändert", cancelled: "Verlängerung gekündigt", resumed: "Verlängerung fortgesetzt", expired: "Abonnement abgelaufen", switched_to_free: "Zu Free gewechselt", payment_failed: "Zahlungsproblem", payment_succeeded: "Zahlung erfolgreich", refund: "Zahlung erstattet" },
    descriptions: { subscription_started: "Das Abonnement deines Haushalts wurde gestartet.", renewed: "Das Abonnement deines Haushalts wurde verlängert.", upgraded: "Der Abonnementtarif deines Haushalts wurde geändert.", downgraded: "Der Abonnementtarif deines Haushalts wurde geändert.", plan_changed: "Der Abonnementtarif deines Haushalts wurde geändert.", cancelled: "Die automatische Verlängerung des Haushaltsabos wurde gekündigt.", resumed: "Die automatische Verlängerung des Haushaltsabos wurde wieder aktiviert.", expired: "Das bezahlte Abonnement deines Haushalts ist beendet.", switched_to_free: "Dein Haushalt ist zum Free-Tarif gewechselt.", payment_failed: "Deine Abozahlung konnte nicht verarbeitet werden.", payment_succeeded: "Die Abozahlung deines Haushalts war erfolgreich.", refund: "Eine Zahlung für das Haushaltsabo wurde erstattet." },
    planNames: { free: "Free", premium_monthly: "Haushalt Premium (monatlich)", premium_yearly: "Haushalt Premium (jährlich)" }, changedYearly: "Zum Jahrestarif gewechselt", changedMonthly: "Zum Monatstarif gewechselt",
    startedPlan: (plan) => `Dein Haushalt hat ${plan} gestartet.`, changedPlan: (plan) => `Dein Haushalt ist zu ${plan} gewechselt.`, changedFromTo: (previous, next) => `Von ${previous} zu ${next} gewechselt.`,
    renewedMonthly: "Dein Haushalt Premium wurde um einen weiteren Monat verlängert.", renewedYearly: "Dein Haushalt Premium wurde um ein weiteres Jahr verlängert.",
    badges: { success: "Erfolgreich", failed: "Fehlgeschlagen", warning: "Hinweis", info: "Aktualisiert", expired: "Abgelaufen", planChange: "Tarifänderung", cancelled: "Gekündigt", refunded: "Erstattet" },
  },
  fr: {
    title: "Facturation et historique", subtitle: "Changements d'abonnement de ce foyer.", filterLabel: "Filtrer l'historique de facturation",
    filters: { all: "Tout", billing: "Facturation", plan_change: "Changements d'offre", renewal: "Renouvellement" },
    loading: "Chargement de l'historique de facturation…", emptyTitle: "Aucun historique de facturation", emptyBody: "Les changements d'abonnement et les paiements de ce foyer apparaîtront ici.",
    filteredEmptyTitle: "Aucune activité dans cette catégorie", filteredEmptyBody: "Choisissez un autre filtre pour voir les autres activités du foyer.",
    error: "Impossible de charger l'historique de facturation.", retry: "Réessayer", showOlder: "Afficher les activités plus anciennes", loadingOlder: "Chargement des activités plus anciennes…", olderError: "Impossible de charger les activités plus anciennes.",
    titles: { subscription_started: "Abonnement commencé", renewed: "Abonnement renouvelé", upgraded: "Offre modifiée", downgraded: "Offre modifiée", plan_changed: "Offre modifiée", cancelled: "Renouvellement annulé", resumed: "Renouvellement réactivé", expired: "Abonnement expiré", switched_to_free: "Passage à l'offre gratuite", payment_failed: "Problème de paiement", payment_succeeded: "Paiement réussi", refund: "Paiement remboursé" },
    descriptions: { subscription_started: "L'abonnement de votre foyer a commencé.", renewed: "L'abonnement de votre foyer a été renouvelé.", upgraded: "L'offre d'abonnement de votre foyer a changé.", downgraded: "L'offre d'abonnement de votre foyer a changé.", plan_changed: "L'offre d'abonnement de votre foyer a changé.", cancelled: "Le renouvellement automatique de l'abonnement du foyer a été annulé.", resumed: "Le renouvellement automatique de l'abonnement du foyer a été réactivé.", expired: "L'abonnement payant de votre foyer a pris fin.", switched_to_free: "Votre foyer est passé à l'offre gratuite.", payment_failed: "Nous n'avons pas pu traiter le paiement de votre abonnement.", payment_succeeded: "Le paiement de l'abonnement du foyer a réussi.", refund: "Un paiement pour l'abonnement du foyer a été remboursé." },
    planNames: { free: "l'offre gratuite", premium_monthly: "Premium du foyer (mensuel)", premium_yearly: "Premium du foyer (annuel)" }, changedYearly: "Passage à l'offre annuelle", changedMonthly: "Passage à l'offre mensuelle",
    startedPlan: (plan) => `Votre foyer a commencé ${plan}.`, changedPlan: (plan) => `Votre foyer est passé à ${plan}.`, changedFromTo: (previous, next) => `Passage de ${previous} à ${next}.`,
    renewedMonthly: "Votre offre Premium du foyer a été renouvelée pour un mois supplémentaire.", renewedYearly: "Votre offre Premium du foyer a été renouvelée pour une année supplémentaire.",
    badges: { success: "Réussi", failed: "Échec", warning: "Attention", info: "Mis à jour", expired: "Expiré", planChange: "Changement d'offre", cancelled: "Annulé", refunded: "Remboursé" },
  },
  es: {
    title: "Facturación e historial", subtitle: "Cambios de suscripción de este hogar.", filterLabel: "Filtrar el historial de facturación",
    filters: { all: "Todo", billing: "Facturación", plan_change: "Cambios de plan", renewal: "Renovación" },
    loading: "Cargando el historial de facturación…", emptyTitle: "Aún no hay historial de facturación", emptyBody: "Aquí aparecerán los cambios de suscripción y los pagos de este hogar.",
    filteredEmptyTitle: "No hay actividad en esta categoría", filteredEmptyBody: "Elige otro filtro para ver más actividad del hogar.",
    error: "No se pudo cargar el historial de facturación.", retry: "Reintentar", showOlder: "Mostrar actividad anterior", loadingOlder: "Cargando actividad anterior…", olderError: "No se pudo cargar la actividad anterior.",
    titles: { subscription_started: "Suscripción iniciada", renewed: "Suscripción renovada", upgraded: "Plan cambiado", downgraded: "Plan cambiado", plan_changed: "Plan cambiado", cancelled: "Renovación cancelada", resumed: "Renovación reanudada", expired: "Suscripción vencida", switched_to_free: "Cambio al plan gratuito", payment_failed: "Problema de pago", payment_succeeded: "Pago correcto", refund: "Pago reembolsado" },
    descriptions: { subscription_started: "La suscripción de tu hogar ha comenzado.", renewed: "La suscripción de tu hogar se ha renovado.", upgraded: "El plan de suscripción de tu hogar ha cambiado.", downgraded: "El plan de suscripción de tu hogar ha cambiado.", plan_changed: "El plan de suscripción de tu hogar ha cambiado.", cancelled: "Se canceló la renovación automática de la suscripción del hogar.", resumed: "Se reanudó la renovación automática de la suscripción del hogar.", expired: "La suscripción de pago de tu hogar ha terminado.", switched_to_free: "Tu hogar cambió al plan gratuito.", payment_failed: "No pudimos procesar el pago de tu suscripción.", payment_succeeded: "El pago de la suscripción del hogar se completó correctamente.", refund: "Se reembolsó un pago de la suscripción del hogar." },
    planNames: { free: "Gratis", premium_monthly: "Premium del hogar (mensual)", premium_yearly: "Premium del hogar (anual)" }, changedYearly: "Cambio al plan anual", changedMonthly: "Cambio al plan mensual",
    startedPlan: (plan) => `Tu hogar inició ${plan}.`, changedPlan: (plan) => `Tu hogar cambió a ${plan}.`, changedFromTo: (previous, next) => `Cambio de ${previous} a ${next}.`,
    renewedMonthly: "Tu plan Premium del hogar se renovó por otro mes.", renewedYearly: "Tu plan Premium del hogar se renovó por otro año.",
    badges: { success: "Correcto", failed: "Fallido", warning: "Atención", info: "Actualizado", expired: "Vencido", planChange: "Cambio de plan", cancelled: "Cancelado", refunded: "Reembolsado" },
  },
};

export const billingHistoryCopy = (language: PlantieLanguage | null | undefined = "en") => copy[language ?? "en"];

export const billingHistoryEventCopy = (item: SubscriptionHistoryItem, language: PlantieLanguage | null | undefined = "en") => {
  const text = billingHistoryCopy(language);
  let title = text.titles[item.type];
  let description = text.descriptions[item.type];
  const plan = item.planKey ? text.planNames[item.planKey] : null;
  const previous = item.previousPlanKey ? text.planNames[item.previousPlanKey] : null;
  const planChanged = item.type === "upgraded" || item.type === "downgraded" || item.type === "plan_changed";
  if (item.type === "subscription_started" && plan) description = text.startedPlan(plan);
  if (item.type === "renewed") {
    if (item.renewalInterval === "monthly") description = text.renewedMonthly;
    if (item.renewalInterval === "yearly") description = text.renewedYearly;
  }
  if (planChanged) {
    if (item.planKey === "premium_yearly") title = text.changedYearly;
    if (item.planKey === "premium_monthly") title = text.changedMonthly;
    if (item.planKey === "free") title = text.titles.switched_to_free;
    if (previous && plan && item.previousPlanKey !== item.planKey) description = text.changedFromTo(previous, plan);
    else if (plan) description = text.changedPlan(plan);
  }
  const badge = item.type === "cancelled" ? text.badges.cancelled
    : item.type === "refund" ? text.badges.refunded
      : planChanged || item.type === "switched_to_free" ? text.badges.planChange
        : text.badges[item.status];
  return { title, description, badge };
};
