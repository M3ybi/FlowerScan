export type ReminderKind = "watering" | "fertilizing" | "custom";
export type ReminderPreference = "web_push" | "native_push_later" | "email_later";

export type PlantReminderSettings = {
  customReminderNote?: string;
  fertilizingIntervalDays?: number | null;
  notificationsEnabled: boolean;
  preference: ReminderPreference;
  wateringIntervalDays: number;
};

export const normalizeReminderSettings = (settings: PlantReminderSettings): PlantReminderSettings => ({
  customReminderNote: settings.customReminderNote?.trim().slice(0, 180) || "",
  fertilizingIntervalDays:
    typeof settings.fertilizingIntervalDays === "number"
      ? Math.max(7, Math.min(120, Math.round(settings.fertilizingIntervalDays)))
      : null,
  notificationsEnabled: settings.notificationsEnabled,
  preference: settings.preference,
  wateringIntervalDays: Math.max(1, Math.min(90, Math.round(settings.wateringIntervalDays))),
});

export const getReminderArchitectureNote = () =>
  "Native push is intentionally not wired yet. Future reminders should fan out through Capacitor Push Notifications, FCM/APNs, and a scheduled Supabase or Netlify job.";
