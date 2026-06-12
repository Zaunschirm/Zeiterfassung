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

function firstFilled(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

const DEFAULT_PREFS = {
  time_tracking_push_enabled: false,
  time_tracking_push_time: "18:00",
  work_assignment_enabled: false,
  work_assignment_push_mode: "06:00_workday",
  work_assignment_day: "workday",
  work_assignment_time: "06:00",
  weekly_admin_push: true,
  monthly_admin_push: true,
};

export default function PushSettings({ currentUser, employeeId, canEdit = true }) {
  const [resolvedEmployee, setResolvedEmployee] = useState(null);

  const rawUserId = firstFilled(
    employeeId,
    currentUser?.employee_id,
    currentUser?.employeeId,
    currentUser?.id
  );
  const userId = resolvedEmployee?.id || rawUserId;
  const role = normalizeRole(resolvedEmployee?.role || currentUser?.role);
  const isAdmin = role === "admin";
  const isEditable = !!canEdit && !!userId;

  const [open, setOpen] = useState(false);
  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  const title = useMemo(() => "⚙️ Meine Einstellungen", []);
  const radioName = useMemo(() => `work_assignment_day_${userId || "me"}`, [userId]);

  useEffect(() => {
    setSupported(arePushNotificationsSupported());
    setPermission(getNotificationPermission());
  }, []);

  // Falls im Login nur Code/Name vorhanden ist, holen wir die echte Mitarbeiter-ID nach.
  // Sonst ist bei normalen MA zwar "Meine Einstellungen" sichtbar, aber Speichern greift ins Leere.
  useEffect(() => {
    let cancelled = false;

    async function resolveEmployee() {
      if (rawUserId || !currentUser?.code) {
        setResolvedEmployee(null);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("employees")
          .select("id, code, name, role")
          .eq("code", currentUser.code)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;
        if (!cancelled) setResolvedEmployee(data || null);
      } catch (e) {
        console.warn("[PushSettings] employee resolve error:", e);
        if (!cancelled) setResolvedEmployee(null);
      }
    }

    resolveEmployee();
    return () => {
      cancelled = true;
    };
  }, [rawUserId, currentUser?.code]);

  useEffect(() => {
    let cancelled = false;

    async function loadPrefs() {
      if (!userId) return;
      setLoading(true);
      setMessage("");

      try {
        const { data, error } = await supabase
          .from("employee_push_settings")
          .select("time_tracking_push_enabled, time_tracking_push_time, work_assignment_enabled, work_assignment_push_mode, work_assignment_day, work_assignment_time, weekly_admin_push, monthly_admin_push")
          .eq("employee_id", userId)
          .maybeSingle();

        if (error && error.code !== "PGRST116") throw error;
        if (!cancelled) {
          setPrefs({
            ...DEFAULT_PREFS,
            ...(data
              ? {
                  time_tracking_push_enabled: !!data.time_tracking_push_enabled,
                  time_tracking_push_time: String(data.time_tracking_push_time || "18:00").slice(0, 5),
                  work_assignment_enabled: !!data.work_assignment_enabled,
                  work_assignment_push_mode: data.work_assignment_push_mode || "06:00_workday",
                  work_assignment_day:
                    data.work_assignment_day ||
                    (String(data.work_assignment_push_mode || "").includes("previous_day") ? "previous_day" : "workday"),
                  work_assignment_time:
                    String(data.work_assignment_time || "").slice(0, 5) ||
                    (String(data.work_assignment_push_mode || "").includes("20:00") ? "20:00" : "06:00"),
                  weekly_admin_push: data.weekly_admin_push !== false,
                  monthly_admin_push: data.monthly_admin_push !== false,
                }
              : {}),
          });
        }
      } catch (e) {
        console.warn("[PushSettings] settings load error:", e);
        if (!cancelled) setMessage("Push-Einstellungen konnten noch nicht geladen werden. SQL/RLS prüfen.");
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
    if (!userId || !isEditable) return;

    const workAssignmentDay = nextPrefs.work_assignment_day || "workday";
    const workAssignmentTime = nextPrefs.work_assignment_time || (workAssignmentDay === "previous_day" ? "20:00" : "06:00");
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
      work_assignment_enabled: !!nextPrefs.work_assignment_enabled,
      work_assignment_push_mode: workAssignmentMode,
      work_assignment_day: workAssignmentDay,
      work_assignment_time: workAssignmentTime,
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
    const subscription = await savePushSubscription({ employeeId: userId, employeeName: resolvedEmployee?.name || currentUser?.name });
    setPermission(getNotificationPermission());
    return subscription;
  }

  async function savePrefs(nextPrefs, needsPushPermission = false) {
    if (!userId || !isEditable) return;
    setSaving(true);
    setMessage("");

    try {
      if (needsPushPermission) await ensurePushAllowed();
      await upsertPrefs(nextPrefs);
      setPrefs(nextPrefs);
      setPermission(getNotificationPermission());
      setMessage("Einstellung gespeichert.");
    } catch (e) {
      console.error("[PushSettings] save error:", e);
      setPermission(getNotificationPermission());
      setMessage(e?.message || "Push konnte nicht aktiviert werden. Bitte Browser-/iPhone-Berechtigung prüfen.");
    } finally {
      setSaving(false);
    }
  }

  function updatePreference(key, value) {
    const nextPrefs = { ...prefs, [key]: value };
    const needsPushPermission =
      supported &&
      ["time_tracking_push_enabled", "work_assignment_enabled", "weekly_admin_push", "monthly_admin_push"].includes(key) &&
      !!value;
    savePrefs(nextPrefs, needsPushPermission);
  }

  if (!currentUser && !employeeId) return null;

  const permissionLabel = permission === "granted" ? "Erlaubt" : permission === "denied" ? "Blockiert" : "Nicht aktiviert";
  const fieldDisabled = loading || saving || !isEditable;
  const pushToggleDisabled = fieldDisabled || !supported;

  return (
    <div className="hbz-card tight push-settings-card user-options-card" style={{ marginTop: 12 }}>
      <button type="button" className="user-options-toggle" onClick={() => setOpen((value) => !value)}>
        <span>{title}</span>
        <span className={`badge-soft push-permission-${permission}`}>{permissionLabel}</span>
        <span className="user-options-chevron">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="user-options-panel">
          {!isEditable && (
            <div className="help" style={{ marginTop: 8 }}>
              Diese Einstellungen gehören nicht zu deinem Benutzer oder die Mitarbeiter-ID fehlt.
            </div>
          )}

          {!supported && (
            <div className="help" style={{ marginTop: 8 }}>
              Push wird auf diesem Gerät/Browser nicht unterstützt. Am iPhone bitte die App zuerst zum Home-Bildschirm hinzufügen.
            </div>
          )}

          {permission === "denied" && supported && (
            <div className="help" style={{ marginTop: 8 }}>
              Benachrichtigungen sind im Browser blockiert. Erst in den Browser-/Website-Einstellungen erlauben, dann hier aktivieren.
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
                      disabled={pushToggleDisabled}
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
                      disabled={fieldDisabled || !prefs.time_tracking_push_enabled}
                      onChange={(e) => updatePreference("time_tracking_push_time", e.target.value || "18:00")}
                    />
                  </div>
                </div>

                <div className="push-option-group">
                  <label className="push-toggle-row">
                    <input
                      type="checkbox"
                      checked={!!prefs.work_assignment_enabled}
                      disabled={pushToggleDisabled}
                      onChange={(e) => updatePreference("work_assignment_enabled", e.target.checked)}
                    />
                    <span>Arbeitseinteilung erhalten, wenn sich meine Einteilung geändert hat</span>
                  </label>

                  <div className="push-radio-list">
                    <label className="push-radio-row">
                      <input
                        type="radio"
                        name={radioName}
                        value="previous_day"
                        checked={(prefs.work_assignment_day || "workday") === "previous_day"}
                        disabled={fieldDisabled || !prefs.work_assignment_enabled}
                        onChange={(e) => {
                          const nextPrefs = {
                            ...prefs,
                            work_assignment_day: e.target.value,
                            work_assignment_time: prefs.work_assignment_time || "20:00",
                          };
                          savePrefs(nextPrefs);
                        }}
                      />
                      <span>Am Vortag</span>
                    </label>
                    <label className="push-radio-row">
                      <input
                        type="radio"
                        name={radioName}
                        value="workday"
                        checked={(prefs.work_assignment_day || "workday") === "workday"}
                        disabled={fieldDisabled || !prefs.work_assignment_enabled}
                        onChange={(e) => {
                          const nextPrefs = {
                            ...prefs,
                            work_assignment_day: e.target.value,
                            work_assignment_time: prefs.work_assignment_time || "06:00",
                          };
                          savePrefs(nextPrefs);
                        }}
                      />
                      <span>Am Arbeitstag</span>
                    </label>
                  </div>

                  <div className="push-inline-setting">
                    <label className="hbz-label">Uhrzeit Arbeitseinteilung</label>
                    <input
                      type="time"
                      className="hbz-input"
                      value={prefs.work_assignment_time || "06:00"}
                      disabled={fieldDisabled || !prefs.work_assignment_enabled}
                      onChange={(e) => updatePreference("work_assignment_time", e.target.value || "06:00")}
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
                    disabled={pushToggleDisabled}
                    onChange={(e) => updatePreference("weekly_admin_push", e.target.checked)}
                  />
                  <span>Wöchentliche Übersicht fehlender Einträge erhalten</span>
                </label>
                <label className="push-toggle-row">
                  <input
                    type="checkbox"
                    checked={!!prefs.monthly_admin_push}
                    disabled={pushToggleDisabled}
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
