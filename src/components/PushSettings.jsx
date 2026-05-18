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
  time_tracking_push_enabled: false,
  time_tracking_push_time: "18:00",
  work_assignment_push_enabled: false,
  work_assignment_push_mode: "06:00_workday",
  work_assignment_push_day: "workday",
  work_assignment_push_time: "06:00",
  weekly_admin_push: true,
  monthly_admin_push: true,
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
          .from("employee_push_settings")
          .select("time_tracking_push_enabled, time_tracking_push_time, work_assignment_push_enabled, work_assignment_push_mode, work_assignment_push_day, work_assignment_push_time, weekly_admin_push, monthly_admin_push")
          .eq("employee_id", userId)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;
        if (!cancelled && data) {
          setPrefs({
            time_tracking_push_enabled: !!data.time_tracking_push_enabled,
            time_tracking_push_time: String(data.time_tracking_push_time || "18:00").slice(0, 5),
            work_assignment_push_enabled: !!data.work_assignment_push_enabled,
            work_assignment_push_mode: data.work_assignment_push_mode || "06:00_workday",
            work_assignment_push_day:
              data.work_assignment_push_day ||
              (String(data.work_assignment_push_mode || "").includes("previous_day") ? "previous_day" : "workday"),
            work_assignment_push_time:
              String(data.work_assignment_push_time || "").slice(0, 5) ||
              (String(data.work_assignment_push_mode || "").includes("20:00") ? "20:00" : "06:00"),
            weekly_admin_push: data.weekly_admin_push !== false,
            monthly_admin_push: data.monthly_admin_push !== false,
          });
        }
      } catch (e) {
        console.warn("[PushSettings] settings load error:", e);
        if (!cancelled) setMessage("Push-Einstellungen konnten noch nicht geladen werden. SQL prüfen.");
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

    const workAssignmentDay = nextPrefs.work_assignment_push_day || "workday";
    const workAssignmentTime = nextPrefs.work_assignment_push_time || (workAssignmentDay === "previous_day" ? "20:00" : "06:00");
    const workAssignmentMode =
      workAssignmentDay === "previous_day" && workAssignmentTime === "20:00"
        ? "20:00_previous_day"
        : workAssignmentDay === "workday" && workAssignmentTime === "06:00"
          ? "06:00_workday"
          : `${workAssignmentDay}_${workAssignmentTime}`;

    const payload = {
      employee_id: userId,
      time_tracking_push_enabled: !!nextPrefs.time_tracking_push_enabled,
      time_tracking_push_time: nextPrefs.time_tracking_push_time || "18:00",
      work_assignment_push_enabled: !!nextPrefs.work_assignment_push_enabled,
      work_assignment_push_mode: workAssignmentMode,
      work_assignment_push_day: workAssignmentDay,
      work_assignment_push_time: workAssignmentTime,
      weekly_admin_push: isAdmin ? !!nextPrefs.weekly_admin_push : false,
      monthly_admin_push: isAdmin ? !!nextPrefs.monthly_admin_push : false,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("employee_push_settings")
      .upsert(payload, { onConflict: "employee_id" });

    if (error) throw error;
  }

  async function ensurePushAllowed() {
    if (!userId) return null;
    const subscription = await savePushSubscription({ employeeId: userId, employeeName: currentUser?.name });
    setPermission(getNotificationPermission());
    return subscription;
  }

  async function savePrefs(nextPrefs, needsPushPermission = false) {
    if (!userId) return;
    setSaving(true);
    setMessage("");

    try {
      if (needsPushPermission) await ensurePushAllowed();
      await upsertPrefs(nextPrefs);
      setPrefs(nextPrefs);
      setMessage("Einstellung gespeichert.");
    } catch (e) {
      console.error("[PushSettings] save error:", e);
      setPermission(getNotificationPermission());
      setMessage(e?.message || "Push konnte nicht aktiviert werden.");
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(key, value) {
    const nextPrefs = { ...prefs, [key]: value };
    const needsPushPermission =
      ["time_tracking_push_enabled", "work_assignment_push_enabled", "weekly_admin_push", "monthly_admin_push"].includes(key) && !!value;
    savePrefs(nextPrefs, needsPushPermission);
  }

  if (!userId) return null;

  const permissionLabel = permission === "granted" ? "Erlaubt" : permission === "denied" ? "Blockiert" : "Nicht aktiviert";

  return (
    <div className="hbz-card tight push-settings-card user-options-card" style={{ marginTop: 12 }}>
      <button type="button" className="user-options-toggle" onClick={() => setOpen((value) => !value)}>
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
                      checked={!!prefs.time_tracking_push_enabled}
                      disabled={loading || saving || !supported}
                      onChange={(e) => updatePreference("time_tracking_push_enabled", e.target.checked)}
                    />
                    <span>Erinnerung, wenn meine Tageserfassung fehlt</span>
                  </label>

                  <div className="push-inline-setting">
                    <label className="hbz-label">Uhrzeit</label>
                    <input
                      type="time"
                      className="hbz-input"
                      value={prefs.time_tracking_push_time || "18:00"}
                      disabled={loading || saving || !prefs.time_tracking_push_enabled}
                      onChange={(e) => updatePreference("time_tracking_push_time", e.target.value || "18:00")}
                    />
                  </div>
                </div>

                <div className="push-option-group">
                  <label className="push-toggle-row">
                    <input
                      type="checkbox"
                      checked={!!prefs.work_assignment_push_enabled}
                      disabled={loading || saving || !supported}
                      onChange={(e) => updatePreference("work_assignment_push_enabled", e.target.checked)}
                    />
                    <span>Arbeitseinteilung erhalten, wenn sich meine Einteilung geändert hat</span>
                  </label>

                  <div className="push-radio-list">
                    <label className="push-radio-row">
                      <input
                        type="radio"
                        name="work_assignment_push_day"
                        value="previous_day"
                        checked={(prefs.work_assignment_push_day || "workday") === "previous_day"}
                        disabled={loading || saving || !prefs.work_assignment_push_enabled}
                        onChange={(e) => {
                          const nextPrefs = {
                            ...prefs,
                            work_assignment_push_day: e.target.value,
                            work_assignment_push_time: prefs.work_assignment_push_time || "20:00",
                          };
                          savePrefs(nextPrefs);
                        }}
                      />
                      <span>Am Vortag</span>
                    </label>
                    <label className="push-radio-row">
                      <input
                        type="radio"
                        name="work_assignment_push_day"
                        value="workday"
                        checked={(prefs.work_assignment_push_day || "workday") === "workday"}
                        disabled={loading || saving || !prefs.work_assignment_push_enabled}
                        onChange={(e) => {
                          const nextPrefs = {
                            ...prefs,
                            work_assignment_push_day: e.target.value,
                            work_assignment_push_time: prefs.work_assignment_push_time || "06:00",
                          };
                          savePrefs(nextPrefs);
                        }}
                      />
                      <span>Am Arbeitstag</span>
                    </label>
                  </div>

                  <div className="push-inline-setting">
                    <label className="hbz-label">
  Uhrzeit {prefs.work_assignment_push_day === "previous_day"
    ? "am Vortag"
    : "am Arbeitstag"}
</label>

<input
  type="time"
  className="hbz-input"
  value={
    prefs.work_assignment_push_time ||
    (prefs.work_assignment_push_day === "previous_day"
      ? "20:00"
      : "06:00")
  }
  disabled={loading || saving || !prefs.work_assignment_push_enabled}
  onChange={(e) => {
    const nextPrefs = {
      ...prefs,
      work_assignment_push_time:
        e.target.value ||
        (prefs.work_assignment_push_day === "previous_day"
          ? "20:00"
          : "06:00"),
    };
    savePrefs(nextPrefs);
  }}
/>
                  </div>

                  <div className="help">Jeder MA stellt selbst ein, ob die geänderte Einteilung am Vortag oder am Arbeitstag kommt. Es wird nur der letzte aktuelle Stand geschickt, nicht jede einzelne Änderung.</div>
                </div>
              </>
            )}

            {isAdmin && (
              <>
                <div className="help">Admin bekommt Sammelinfos. Mitarbeiter stellen ihre eigenen Erinnerungen selbst ein.</div>
                <label className="push-toggle-row">
                  <input
                    type="checkbox"
                    checked={!!prefs.weekly_admin_push}
                    disabled={loading || saving || !supported}
                    onChange={(e) => updatePreference("weekly_admin_push", e.target.checked)}
                  />
                  <span>Wöchentliche Übersicht fehlender Einträge erhalten</span>
                </label>
                <label className="push-toggle-row">
                  <input
                    type="checkbox"
                    checked={!!prefs.monthly_admin_push}
                    disabled={loading || saving || !supported}
                    onChange={(e) => updatePreference("monthly_admin_push", e.target.checked)}
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
