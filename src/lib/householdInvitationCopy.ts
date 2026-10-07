import type { PlantieLanguage } from "./onboarding.js";
import type { HouseholdInvitationStatus } from "./plantieRepository.js";

type Copy = {
  inboxTitle: string; inboxEmpty: string; loadFailed: string; retry: string; viewInvite: string;
  inboxSubtitle: string; inboxEmptyHint: string; pending: string; pendingCount: (count: number) => string;
  close: string; backToInbox: string; acceptedTitle: (name: string) => string; acceptedNotice: string;
  invitedBy: string; sentTo: string; expires: string; viewer: string; members: string; occupiedSlots: string;
  title: (name: string) => string; details: string; plantBenefits: readonly string[];
  existingHouseholdNotice: (name: string) => string; authPrompt: (email: string) => string;
  wrongAccount: (invited: string, current: string) => string; useAnotherAccount: string; cancel: string;
  verifyEmail: string; accept: string; accepting: string; decline: string; declining: string;
  declineConfirm: (name: string) => string; keepInvitation: string; accepted: (name: string) => string;
  stay: string; switchTo: (name: string) => string; alreadyMember: (name: string) => string;
  terminal: Record<Exclude<HouseholdInvitationStatus, "pending"> | "invalid", string>;
  loading: string; reviewAfterAuth: string;
};

const en: Copy = {
  inboxTitle: "Household invitations", inboxEmpty: "You have no pending household invitations.", loadFailed: "Invitations could not be loaded. Try again.", retry: "Retry", viewInvite: "View invitation",
  inboxSubtitle: "Invitations sent to your account appear here.", inboxEmptyHint: "When someone invites you to a household, it will appear here.", pending: "Pending", pendingCount: (count) => `Household invitations, ${count} pending`,
  close: "Close", backToInbox: "Back to invitations", acceptedTitle: (name) => `You're now a member of ${name}.`, acceptedNotice: "Your existing household has not changed. You can switch between households at any time.",
  invitedBy: "Invited by", sentTo: "Sent to", expires: "Expires", viewer: "Viewer", members: "Active members", occupiedSlots: "Household slots",
  title: (name) => `Join ${name}`, details: "You've been invited to join this household as a Viewer.",
  plantBenefits: ["Add and manage plants", "Update watering and plant care", "Use the household's available features"],
  existingHouseholdNotice: (name) => `Your existing household will not be removed or changed. Joining ${name} adds another household to your account. You can switch between your households at any time.`,
  authPrompt: (email) => `Create an account or sign in using ${email} to review this invitation.`,
  wrongAccount: (invited, current) => `This invitation was sent to ${invited}. You're currently signed in as ${current}. Please sign in using the invited email address.`,
  useAnotherAccount: "Use another account", cancel: "Cancel", verifyEmail: "Verify your email before accepting. After verification, you'll return to this invitation.",
  accept: "Join household", accepting: "Joining household…", decline: "Decline invitation", declining: "Declining invitation…",
  declineConfirm: (name) => `Decline invitation to ${name}? You can only join later if an Owner sends another invitation.`, keepInvitation: "Keep invitation",
  accepted: (name) => `You're now a member of ${name}. Your existing household has not changed.`, stay: "Stay in current household", switchTo: (name) => `Switch to ${name}`, alreadyMember: (name) => `You're already a member of ${name}.`,
  terminal: { invalid: "This invitation is invalid. Ask a household owner to send a new invitation.", expired: "This household invitation has expired. Ask a household owner to send a new invitation.", revoked: "This invitation was revoked by a household owner.", declined: "This invitation has been declined.", accepted: "This invitation has already been accepted.", unavailable: "This household is no longer accepting this invitation. Ask an owner to send a new invitation." },
  loading: "Loading invitation…", reviewAfterAuth: "After signing in and verifying your email, you can review and accept this invitation.",
};

const copy: Record<PlantieLanguage, Copy> = {
  en,
  sk: {
    inboxTitle: "Pozvánky do domácností", inboxEmpty: "Nemáte žiadne čakajúce pozvánky do domácností.", loadFailed: "Pozvánky sa nepodarilo načítať. Skúste to znova.", retry: "Skúsiť znova", viewInvite: "Zobraziť pozvánku",
    inboxSubtitle: "Tu nájdete pozvánky odoslané na váš účet.", inboxEmptyHint: "Keď vás niekto pozve do domácnosti, pozvánka sa zobrazí tu.", pending: "Čakajúca", pendingCount: (count) => `Pozvánky do domácností, počet čakajúcich: ${count}`,
    close: "Zavrieť", backToInbox: "Späť na pozvánky", acceptedTitle: (name) => `Teraz ste členom domácnosti ${name}.`, acceptedNotice: "Vaša existujúca domácnosť sa nezmenila. Medzi domácnosťami môžete kedykoľvek prepínať.",
    invitedBy: "Pozval vás", sentTo: "Odoslané na", expires: "Platí do", viewer: "Pozorovateľ", members: "Aktívni členovia", occupiedSlots: "Miesta v domácnosti",
    title: (name) => `Pripojiť sa k ${name}`, details: "Boli ste pozvaní do tejto domácnosti ako Pozorovateľ.",
    plantBenefits: ["Pridávať a spravovať rastliny", "Upravovať polievanie a starostlivosť", "Používať dostupné funkcie domácnosti"],
    existingHouseholdNotice: (name) => `Vaša existujúca domácnosť sa nezruší ani nezmení. Pripojením k ${name} pridáte do účtu ďalšiu domácnosť. Medzi domácnosťami môžete kedykoľvek prepínať.`,
    authPrompt: (email) => `Vytvorte si účet alebo sa prihláste pomocou ${email} a pozvánku si skontrolujte.`,
    wrongAccount: (invited, current) => `Táto pozvánka bola odoslaná na ${invited}. Teraz ste prihlásení ako ${current}. Prihláste sa e-mailom, na ktorý prišla pozvánka.`,
    useAnotherAccount: "Použiť iný účet", cancel: "Zrušiť", verifyEmail: "Pred prijatím potvrďte svoj e-mail. Po potvrdení sa vrátite k tejto pozvánke.",
    accept: "Pripojiť sa k domácnosti", accepting: "Pripájam k domácnosti…", decline: "Odmietnuť pozvánku", declining: "Odmietam pozvánku…",
    declineConfirm: (name) => `Odmietnuť pozvánku do ${name}? Neskôr sa môžete pripojiť iba po novej pozvánke od vlastníka.`, keepInvitation: "Ponechať pozvánku",
    accepted: (name) => `Teraz ste členom domácnosti ${name}. Vaša existujúca domácnosť sa nezmenila.`, stay: "Zostať v aktuálnej domácnosti", switchTo: (name) => `Prepnúť na ${name}`, alreadyMember: (name) => `Už ste členom domácnosti ${name}.`,
    terminal: { invalid: "Táto pozvánka je neplatná. Požiadajte vlastníka domácnosti o novú pozvánku.", expired: "Platnosť tejto pozvánky sa skončila. Požiadajte vlastníka domácnosti o novú pozvánku.", revoked: "Vlastník domácnosti túto pozvánku zrušil.", declined: "Táto pozvánka bola odmietnutá.", accepted: "Táto pozvánka už bola prijatá.", unavailable: "Táto domácnosť už pozvánku nemôže prijať. Požiadajte vlastníka o novú pozvánku." },
    loading: "Načítavam pozvánku…", reviewAfterAuth: "Po prihlásení a potvrdení e-mailu si môžete pozvánku skontrolovať a prijať.",
  },
  de: {
    inboxTitle: "Haushaltseinladungen", inboxEmpty: "Du hast keine ausstehenden Haushaltseinladungen.", loadFailed: "Einladungen konnten nicht geladen werden. Versuche es erneut.", retry: "Erneut versuchen", viewInvite: "Einladung ansehen",
    inboxSubtitle: "Hier erscheinen Einladungen an dein Konto.", inboxEmptyHint: "Wenn dich jemand in einen Haushalt einlädt, erscheint die Einladung hier.", pending: "Ausstehend", pendingCount: (count) => `Haushaltseinladungen, ${count} ausstehend`,
    close: "Schließen", backToInbox: "Zurück zu Einladungen", acceptedTitle: (name) => `Du bist jetzt Mitglied von ${name}.`, acceptedNotice: "Dein bestehender Haushalt hat sich nicht verändert. Du kannst jederzeit zwischen deinen Haushalten wechseln.",
    invitedBy: "Eingeladen von", sentTo: "Gesendet an", expires: "Gültig bis", viewer: "Betrachter", members: "Aktive Mitglieder", occupiedSlots: "Haushaltsplätze",
    title: (name) => `${name} beitreten`, details: "Du wurdest als Betrachter in diesen Haushalt eingeladen.", plantBenefits: ["Pflanzen hinzufügen und verwalten", "Bewässerung und Pflanzenpflege bearbeiten", "Verfügbare Haushaltsfunktionen nutzen"],
    existingHouseholdNotice: (name) => `Dein bestehender Haushalt wird nicht entfernt oder verändert. Mit ${name} erhält dein Konto einen weiteren Haushalt. Du kannst jederzeit zwischen deinen Haushalten wechseln.`,
    authPrompt: (email) => `Erstelle ein Konto oder melde dich mit ${email} an, um diese Einladung anzusehen.`, wrongAccount: (invited, current) => `Diese Einladung wurde an ${invited} gesendet. Du bist als ${current} angemeldet. Melde dich mit der eingeladenen E-Mail-Adresse an.`,
    useAnotherAccount: "Anderes Konto verwenden", cancel: "Abbrechen", verifyEmail: "Bestätige deine E-Mail, bevor du die Einladung annimmst. Danach kehrst du zu dieser Einladung zurück.", accept: "Haushalt beitreten", accepting: "Haushalt wird beigetreten…", decline: "Einladung ablehnen", declining: "Einladung wird abgelehnt…",
    declineConfirm: (name) => `Einladung zu ${name} ablehnen? Ein späterer Beitritt erfordert eine neue Einladung eines Inhabers.`, keepInvitation: "Einladung behalten", accepted: (name) => `Du bist jetzt Mitglied von ${name}. Dein bestehender Haushalt hat sich nicht verändert.`, stay: "Im aktuellen Haushalt bleiben", switchTo: (name) => `Zu ${name} wechseln`, alreadyMember: (name) => `Du bist bereits Mitglied von ${name}.`,
    terminal: { invalid: "Diese Einladung ist ungültig. Bitte einen Haushaltsinhaber um eine neue Einladung.", expired: "Diese Haushaltseinladung ist abgelaufen. Bitte einen Inhaber um eine neue Einladung.", revoked: "Ein Haushaltsinhaber hat diese Einladung widerrufen.", declined: "Diese Einladung wurde abgelehnt.", accepted: "Diese Einladung wurde bereits angenommen.", unavailable: "Dieser Haushalt kann diese Einladung nicht mehr annehmen. Bitte einen Inhaber um eine neue Einladung." }, loading: "Einladung wird geladen…", reviewAfterAuth: "Nach der Anmeldung und E-Mail-Bestätigung kannst du die Einladung ansehen und annehmen.",
  },
  fr: {
    inboxTitle: "Invitations au foyer", inboxEmpty: "Vous n'avez aucune invitation en attente.", loadFailed: "Impossible de charger les invitations. Réessayez.", retry: "Réessayer", viewInvite: "Voir l'invitation", invitedBy: "Invité par", sentTo: "Envoyée à", expires: "Expire le", viewer: "Observateur", members: "Membres actifs", occupiedSlots: "Places du foyer",
    inboxSubtitle: "Les invitations envoyées à votre compte apparaissent ici.", inboxEmptyHint: "Quand quelqu'un vous invite dans un foyer, l'invitation apparaît ici.", pending: "En attente", pendingCount: (count) => `Invitations au foyer, ${count} en attente`,
    close: "Fermer", backToInbox: "Retour aux invitations", acceptedTitle: (name) => `Vous êtes maintenant membre de ${name}.`, acceptedNotice: "Votre foyer existant n'a pas changé. Vous pouvez changer de foyer à tout moment.",
    title: (name) => `Rejoindre ${name}`, details: "Vous avez été invité à rejoindre ce foyer comme Observateur.", plantBenefits: ["Ajouter et gérer les plantes", "Modifier l'arrosage et les soins", "Utiliser les fonctionnalités disponibles du foyer"],
    existingHouseholdNotice: (name) => `Votre foyer existant ne sera ni supprimé ni modifié. Rejoindre ${name} ajoute un autre foyer à votre compte. Vous pouvez changer de foyer à tout moment.`, authPrompt: (email) => `Créez un compte ou connectez-vous avec ${email} pour consulter cette invitation.`, wrongAccount: (invited, current) => `Cette invitation a été envoyée à ${invited}. Vous êtes connecté avec ${current}. Connectez-vous avec l'adresse invitée.`,
    useAnotherAccount: "Utiliser un autre compte", cancel: "Annuler", verifyEmail: "Vérifiez votre e-mail avant d'accepter. Vous reviendrez ensuite à cette invitation.", accept: "Rejoindre le foyer", accepting: "Connexion au foyer…", decline: "Refuser l'invitation", declining: "Refus de l'invitation…", declineConfirm: (name) => `Refuser l'invitation à ${name} ? Pour rejoindre plus tard, un propriétaire devra envoyer une nouvelle invitation.`, keepInvitation: "Garder l'invitation", accepted: (name) => `Vous êtes maintenant membre de ${name}. Votre foyer existant n'a pas changé.`, stay: "Rester dans le foyer actuel", switchTo: (name) => `Passer à ${name}`, alreadyMember: (name) => `Vous êtes déjà membre de ${name}.`,
    terminal: { invalid: "Cette invitation est invalide. Demandez une nouvelle invitation à un propriétaire.", expired: "Cette invitation au foyer a expiré. Demandez une nouvelle invitation à un propriétaire.", revoked: "Un propriétaire a révoqué cette invitation.", declined: "Cette invitation a été refusée.", accepted: "Cette invitation a déjà été acceptée.", unavailable: "Ce foyer ne peut plus accepter cette invitation. Demandez une nouvelle invitation à un propriétaire." }, loading: "Chargement de l'invitation…", reviewAfterAuth: "Après connexion et vérification de l'e-mail, vous pourrez consulter et accepter l'invitation.",
  },
  es: {
    inboxTitle: "Invitaciones al hogar", inboxEmpty: "No tienes invitaciones pendientes.", loadFailed: "No se pudieron cargar las invitaciones. Inténtalo de nuevo.", retry: "Reintentar", viewInvite: "Ver invitación", invitedBy: "Invitado por", sentTo: "Enviada a", expires: "Caduca", viewer: "Observador", members: "Miembros activos", occupiedSlots: "Plazas del hogar",
    inboxSubtitle: "Aquí aparecen las invitaciones enviadas a tu cuenta.", inboxEmptyHint: "Cuando alguien te invite a un hogar, la invitación aparecerá aquí.", pending: "Pendiente", pendingCount: (count) => `Invitaciones al hogar, ${count} pendientes`,
    close: "Cerrar", backToInbox: "Volver a las invitaciones", acceptedTitle: (name) => `Ya eres miembro de ${name}.`, acceptedNotice: "Tu hogar actual no ha cambiado. Puedes cambiar de hogar cuando quieras.",
    title: (name) => `Unirse a ${name}`, details: "Te han invitado a este hogar como Observador.", plantBenefits: ["Añadir y gestionar plantas", "Modificar el riego y los cuidados", "Usar las funciones disponibles del hogar"], existingHouseholdNotice: (name) => `Tu hogar actual no se eliminará ni cambiará. Unirte a ${name} añade otro hogar a tu cuenta. Puedes cambiar de hogar cuando quieras.`, authPrompt: (email) => `Crea una cuenta o inicia sesión con ${email} para revisar esta invitación.`, wrongAccount: (invited, current) => `Esta invitación se envió a ${invited}. Has iniciado sesión como ${current}. Inicia sesión con el correo invitado.`,
    useAnotherAccount: "Usar otra cuenta", cancel: "Cancelar", verifyEmail: "Verifica tu correo antes de aceptar. Después volverás a esta invitación.", accept: "Unirse al hogar", accepting: "Uniéndose al hogar…", decline: "Rechazar invitación", declining: "Rechazando invitación…", declineConfirm: (name) => `¿Rechazar la invitación a ${name}? Solo podrás unirte más tarde si un propietario envía otra invitación.`, keepInvitation: "Conservar invitación", accepted: (name) => `Ya eres miembro de ${name}. Tu hogar actual no ha cambiado.`, stay: "Permanecer en el hogar actual", switchTo: (name) => `Cambiar a ${name}`, alreadyMember: (name) => `Ya eres miembro de ${name}.`,
    terminal: { invalid: "Esta invitación no es válida. Pide una nueva invitación a un propietario.", expired: "Esta invitación al hogar ha caducado. Pide una nueva invitación a un propietario.", revoked: "Un propietario ha revocado esta invitación.", declined: "Esta invitación ha sido rechazada.", accepted: "Esta invitación ya ha sido aceptada.", unavailable: "Este hogar ya no puede aceptar esta invitación. Pide una nueva invitación a un propietario." }, loading: "Cargando invitación…", reviewAfterAuth: "Tras iniciar sesión y verificar el correo, podrás revisar y aceptar la invitación.",
  },
};

export const householdInvitationCopy = (language: PlantieLanguage | null = "en") => copy[language ?? "en"];
