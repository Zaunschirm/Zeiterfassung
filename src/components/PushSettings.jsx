import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  arePushNotificationsSupported,
  getNotificationPermission,
  savePushSubscription,
} from "../utils/pushNotifications";

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

const DEFAULT_PREFS = {
  daily_missing_reminder: false,
  daily_reminder_time: "18:00",
  work_assignment_push: false,
  work_assignment_push_timing: "workday_morning",
  admin_weekly_summary: true,
  admin_monthly_summary: true,
};

export default function PushSettings({ currentUser }) {
  const userId = currentUser?.id;
  const role = normalizeRole(currentUser?.role);
  const isAdmin = role === "admin";

  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  const title = useMemo(() => "⚙️ Meine Einstellungen", []);

  useEffect(() => {
    setSupported(arePushNotificationsSupported());
    setPermission(getNotificationPermission());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPrefs() {
      if (!userId) return;
      setLoading(true);
      setMessage("");

      try {
        const { data, error } = await supabase
          .from("push_preferences")
          .select("daily_missing_reminder, daily_reminder_time, work_assignment_push, work_assignment_push_timing, admin_weekly_summary, admin_monthly_summary")
          .eq("employee_id", userId)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;
        if (!cancelled && data) {
          setPrefs({
            daily_missing_reminder: !!data.daily_missing_reminder,
            daily_reminder_time: String(data.daily_reminder_time || "18:00").slice(0, 5),
            work_assignment_push: !!data.work_assignment_push,
            work_assignment_push_timing: data.work_assignment_push_timing || "workday_morning",
            admin_weekly_summary: data.admin_weekly_summary !== false,
            admin_monthly_summary: data.admin_monthly_summary !== false,
          });
        }
      } catch (e) {
        console.warn("[PushSettings] preferences load error:", e);
        if (!cancelled) {
          setMessage("Push-Einstellungen konnten noch nicht geladen werden. SQL-Migration prüfen.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPrefs();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function upsertPrefs(nextPrefs) {
    if (!userId) return;

    const payload = {
      employee_id: userId,
      daily_missing_reminder: !!nextPrefs.daily_missing_reminder,
      daily_reminder_time: nextPrefs.daily_reminder_time || "18:00",
      work_assignment_push: !!nextPrefs.work_assignment_push,
      work_assignment_push_timing: nextPrefs.work_assignment_push_timing || "workday_morning",
      admin_weekly_summary: isAdmin ? !!nextPrefs.admin_weekly_summary : false,
      admin_monthly_summary: isAdmin ? !!nextPrefs.admin_monthly_summary : false,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("push_preferences")
      .upsert(payload, { onConflict: "employee_id" });

    if (error) throw error;
  }

  async function ensurePushAllowed() {
    if (!userId) return null;
    const subscription = await savePushSubscription({ employeeId: userId });
    setPermission(getNotificationPermission());
    return subscription;
  }

  async function savePrefs(nextPrefs, needsPushPermission = false) {
    if (!userId) return;
    setSaving(true);
    setMessage("");

    try {
      if (needsPushPermission) {
        await ensurePushAllowed();
      }
      await upsertPrefs(nextPrefs);
      setPrefs(nextPrefs);
      setMessage("Einstellung gespeichert.");
    } catch (e) {
      console.error("[PushSettings] save error:", e);
      setPermission(getNotificationPermission());
      setMessage(
        e?.message ||
          "Push konnte nicht aktiviert werden. Am iPhone muss die App meist am Home-Bildschirm installiert sein."
      );
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(key, value) {
    const nextPrefs = { ...prefs, [key]: value };
    const needsPushPermission =
      (key === "daily_missing_reminder" || key === "work_assignment_push" || key === "admin_weekly_summary" || key === "admin_monthly_summary") &&
      !!value;
    savePrefs(nextPrefs, needsPushPermission);
  }

  if (!userId) return null;

  const permissionLabel =
    permission === "granted" ? "Erlaubt" : permission === "denied" ? "Blockiert" : "Nicht aktiviert";

  return (
    <div className="hbz-card tight push-settings-card user-options-card">
      <button
        type="button"
        className="user-options-toggle"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{title}</span>
        <span className={`badge-soft push-permission-${permission}`}>{permissionLabel}</span>
        <span className="user-options-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="user-options-panel">
          {!supported && (
            <div className="help" style={{ marginTop: 8 }}>
              Push wird auf diesem Gerät/Browser nicht unterstützt. Am iPhone bitte die App zuerst zum Home-Bildschirm hinzufügen.
            </div>
          )}

          <div className="push-settings-options">
            {!isAdmin && (
              <>
                <div className="push-option-group">
                  <label className="push-toggle-row">
                    <input
                      type="checkbox"
                      checked={!!prefs.daily_missing_reminder}
                      disabled={loading || saving || !supported}
                      onChange={(e) => updatePreference("daily_missing_reminder", e.target.checked)}
                    />
                    <span>Erinnerung, wenn meine Tageserfassung fehlt</span>
                  </label>

                  <div className="push-inline-setting">
                    <label className="hbz-label">Uhrzeit</label>
                    <input
                      type="time"
                      className="hbz-input"
                      value={prefs.daily_reminder_time || "18:00"}
                      disabled={loading || saving || !prefs.daily_missing_reminder}
                      onChange={(e) => updatePreference("daily_reminder_time", e.target.value || "18:00")}
                    />
                  </div>
                </div>

                <div className="push-option-group">
                  <label className="push-toggle-row">
                    <input
                      type="checkbox"
                      checked={!!prefs.work_assignment_push}
                      disabled={loading || saving || !supported}
                      onChange={(e) => updatePreference("work_assignment_push", e.target.checked)}
                    />
                    <span>Arbeitseinteilung erhalten, wenn sich meine Einteilung geändert hat</span>
                  </label>

                  <div className="push-radio-list">
                    <label className="push-radio-row">
                      <input
                        type="radio"
                        name="work_assignment_push_timing"
                        value="previous_evening"
                        checked={prefs.work_assignment_push_timing === "previous_evening"}
                        disabled={loading || saving || !prefs.work_assignment_push}
                        onChange={(e) => updatePreference("work_assignment_push_timing", e.target.value)}
                      />
                      <span>Am Vortag um 20:00</span>
                    </label>
                    <label className="push-radio-row">
                      <input
                        type="radio"
                        name="work_assignment_push_timing"
                        value="workday_morning"
                        checked={prefs.work_assignment_push_timing === "workday_morning"}
                        disabled={loading || saving || !prefs.work_assignment_push}
                        onChange={(e) => updatePreference("work_assignment_push_timing", e.target.value)}
                      />
                      <span>Am Arbeitstag um 06:00</span>
                    </label>
                  </div>
                  <div className="help">Es wird nur der letzte aktuelle Stand geschickt, nicht jede einzelne Änderung.</div>
                </div>
              </>
            )}

            {isAdmin && (
              <>
                <div className="help">
                  Admin bekommt Sammelinfos. Mitarbeiter stellen ihre eigenen Erinnerungen selbst ein.
                </div>
                <label className="push-toggle-row">
                  <input
                    type="checkbox"
                    checked={!!prefs.admin_weekly_summary}
                    disabled={loading || saving || !supported}
                    onChange={(e) => updatePreference("admin_weekly_summary", e.target.checked)}
                  />
                  <span>Wöchentliche Übersicht fehlender Einträge erhalten</span>
                </label>
                <label className="push-toggle-row">
                  <input
                    type="checkbox"
                    checked={!!prefs.admin_monthly_summary}
                    disabled={loading || saving || !supported}
                    onChange={(e) => updatePreference("admin_monthly_summary", e.target.checked)}
                  />
                  <span>Am 03. Übersicht fürs Vormonat erhalten</span>
                </label>
              </>
            )}
          </div>

          {message && <div className="help push-settings-message">{message}</div>}
        </div>
      )}
    </div>
  );
}
