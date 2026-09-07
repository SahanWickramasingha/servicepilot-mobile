import {
  Bell,
  CheckCircle2,
  Clock3,
  Mail,
  MapPinned,
  Save,
  Settings as SettingsIcon,
  ShieldCheck,
  UserCog,
  Wrench,
} from "lucide-react";
import { useState } from "react";

type SettingsState = {
  companyName: string;
  supportEmail: string;
  supportPhone: string;
  emergencyPhone: string;
  serviceRadius: string;
  openingTime: string;
  closingTime: string;
  autoAssignment: boolean;
  emergencyPriority: boolean;
  customerNotifications: boolean;
  technicianNotifications: boolean;
  emailNotifications: boolean;
  maintenanceMode: boolean;
};

const initialSettings: SettingsState = {
  companyName: "ServicePilot",
  supportEmail: "support@servicepilot.lk",
  supportPhone: "+94 11 234 5678",
  emergencyPhone: "+94 77 000 0000",
  serviceRadius: "50",
  openingTime: "08:00",
  closingTime: "20:00",
  autoAssignment: false,
  emergencyPriority: true,
  customerNotifications: true,
  technicianNotifications: true,
  emailNotifications: true,
  maintenanceMode: false,
};

export default function Settings() {
  const [settings, setSettings] =
    useState<SettingsState>(initialSettings);

  const [saved, setSaved] = useState(false);

  const updateSetting = <
    K extends keyof SettingsState
  >(
    key: K,
    value: SettingsState[K]
  ) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));

    setSaved(false);
  };

  const saveSettings = () => {
    setSaved(true);

    setTimeout(() => {
      setSaved(false);
    }, 2500);
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>System Settings</h1>

          <p>
            Configure ServicePilot system,
            service and notification settings.
          </p>
        </div>

        <button
          className="save-settings-button"
          onClick={saveSettings}
        >
          {saved ? (
            <>
              <CheckCircle2 size={16} />
              Saved
            </>
          ) : (
            <>
              <Save size={16} />
              Save Changes
            </>
          )}
        </button>
      </div>

      {saved && (
        <div className="settings-success">
          <CheckCircle2 size={17} />

          <div>
            <strong>
              Settings updated
            </strong>

            <span>
              System configuration was saved successfully.
            </span>
          </div>
        </div>
      )}

      <div className="settings-layout">
        <div className="settings-main">
          {/* General */}

          <SettingsSection
            icon={<SettingsIcon size={19} />}
            title="General Settings"
            description="Basic ServicePilot organization information"
          >
            <div className="settings-form-grid">
              <SettingsInput
                label="System Name"
                value={settings.companyName}
                onChange={(value) =>
                  updateSetting(
                    "companyName",
                    value
                  )
                }
              />

              <SettingsInput
                label="Support Email"
                value={settings.supportEmail}
                type="email"
                onChange={(value) =>
                  updateSetting(
                    "supportEmail",
                    value
                  )
                }
              />

              <SettingsInput
                label="Support Phone"
                value={settings.supportPhone}
                onChange={(value) =>
                  updateSetting(
                    "supportPhone",
                    value
                  )
                }
              />

              <SettingsInput
                label="Emergency Contact"
                value={settings.emergencyPhone}
                onChange={(value) =>
                  updateSetting(
                    "emergencyPhone",
                    value
                  )
                }
              />
            </div>
          </SettingsSection>

          {/* Service Operations */}

          <SettingsSection
            icon={<Wrench size={19} />}
            title="Service Operations"
            description="Configure working hours and assignment behaviour"
          >
            <div className="settings-form-grid">
              <SettingsInput
                label="Opening Time"
                value={settings.openingTime}
                type="time"
                onChange={(value) =>
                  updateSetting(
                    "openingTime",
                    value
                  )
                }
              />

              <SettingsInput
                label="Closing Time"
                value={settings.closingTime}
                type="time"
                onChange={(value) =>
                  updateSetting(
                    "closingTime",
                    value
                  )
                }
              />

              <SettingsInput
                label="Service Radius (km)"
                value={settings.serviceRadius}
                type="number"
                onChange={(value) =>
                  updateSetting(
                    "serviceRadius",
                    value
                  )
                }
              />
            </div>

            <div className="settings-toggle-list">
              <ToggleSetting
                icon={<UserCog size={18} />}
                title="Automatic Technician Assignment"
                description="Automatically select suitable available technicians for new requests."
                checked={
                  settings.autoAssignment
                }
                onChange={() =>
                  updateSetting(
                    "autoAssignment",
                    !settings.autoAssignment
                  )
                }
              />

              <ToggleSetting
                icon={<ShieldCheck size={18} />}
                title="Emergency Priority"
                description="Move emergency requests to the highest assignment priority."
                checked={
                  settings.emergencyPriority
                }
                onChange={() =>
                  updateSetting(
                    "emergencyPriority",
                    !settings.emergencyPriority
                  )
                }
              />
            </div>
          </SettingsSection>

          {/* Notifications */}

          <SettingsSection
            icon={<Bell size={19} />}
            title="Notification Settings"
            description="Control system notification delivery"
          >
            <div className="settings-toggle-list">
              <ToggleSetting
                icon={<Bell size={18} />}
                title="Customer Push Notifications"
                description="Send booking, technician and job status updates to customers."
                checked={
                  settings.customerNotifications
                }
                onChange={() =>
                  updateSetting(
                    "customerNotifications",
                    !settings.customerNotifications
                  )
                }
              />

              <ToggleSetting
                icon={<UserCog size={18} />}
                title="Technician Push Notifications"
                description="Send new assignments and service updates to technicians."
                checked={
                  settings.technicianNotifications
                }
                onChange={() =>
                  updateSetting(
                    "technicianNotifications",
                    !settings.technicianNotifications
                  )
                }
              />

              <ToggleSetting
                icon={<Mail size={18} />}
                title="Email Notifications"
                description="Send important system alerts and updates by email."
                checked={
                  settings.emailNotifications
                }
                onChange={() =>
                  updateSetting(
                    "emailNotifications",
                    !settings.emailNotifications
                  )
                }
              />
            </div>
          </SettingsSection>

          {/* Security */}

          <SettingsSection
            icon={<ShieldCheck size={19} />}
            title="System & Security"
            description="Administrative system controls"
          >
            <div className="settings-toggle-list">
              <ToggleSetting
                icon={<ShieldCheck size={18} />}
                title="Maintenance Mode"
                description="Temporarily prevent customer and technician access while system maintenance is performed."
                checked={
                  settings.maintenanceMode
                }
                danger
                onChange={() =>
                  updateSetting(
                    "maintenanceMode",
                    !settings.maintenanceMode
                  )
                }
              />
            </div>
          </SettingsSection>
        </div>

        {/* Summary Panel */}

        <aside className="settings-summary-panel">
          <div className="settings-summary-heading">
            <SettingsIcon size={20} />

            <div>
              <strong>
                Current Configuration
              </strong>

              <span>
                ServicePilot environment
              </span>
            </div>
          </div>

          <SummaryRow
            icon={<Clock3 size={15} />}
            label="Operating Hours"
            value={`${settings.openingTime} - ${settings.closingTime}`}
          />

          <SummaryRow
            icon={<MapPinned size={15} />}
            label="Service Radius"
            value={`${settings.serviceRadius} km`}
          />

          <SummaryRow
            icon={<UserCog size={15} />}
            label="Auto Assignment"
            value={
              settings.autoAssignment
                ? "Enabled"
                : "Disabled"
            }
          />

          <SummaryRow
            icon={<ShieldCheck size={15} />}
            label="Emergency Priority"
            value={
              settings.emergencyPriority
                ? "Enabled"
                : "Disabled"
            }
          />

          <SummaryRow
            icon={<Bell size={15} />}
            label="Push Notifications"
            value={
              settings.customerNotifications &&
              settings.technicianNotifications
                ? "Enabled"
                : "Limited"
            }
          />

          <div
            className={`system-mode-card ${
              settings.maintenanceMode
                ? "maintenance"
                : "online"
            }`}
          >
            <span className="system-mode-dot" />

            <div>
              <strong>
                {settings.maintenanceMode
                  ? "Maintenance Mode"
                  : "System Online"}
              </strong>

              <span>
                {settings.maintenanceMode
                  ? "Mobile access is restricted."
                  : "All ServicePilot services are operational."}
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function SettingsSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="dashboard-card settings-section">
      <div className="settings-section-heading">
        <div className="settings-section-icon">
          {icon}
        </div>

        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      {children}
    </section>
  );
}

function SettingsInput({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="settings-input-field">
      <label>{label}</label>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
      />
    </div>
  );
}

function ToggleSetting({
  icon,
  title,
  description,
  checked,
  onChange,
  danger = false,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  onChange: () => void;
  danger?: boolean;
}) {
  return (
    <div className="settings-toggle-row">
      <div
        className={`settings-toggle-icon ${
          danger ? "danger" : ""
        }`}
      >
        {icon}
      </div>

      <div className="settings-toggle-info">
        <strong>{title}</strong>
        <span>{description}</span>
      </div>

      <button
        className={`settings-switch ${
          checked ? "enabled" : ""
        } ${
          danger && checked
            ? "danger-enabled"
            : ""
        }`}
        onClick={onChange}
        aria-pressed={checked}
      >
        <span />
      </button>
    </div>
  );
}

function SummaryRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="settings-summary-row">
      <div className="settings-summary-row-icon">
        {icon}
      </div>

      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}