import { Settings as SettingsIcon, ShieldCheck, Terminal } from "lucide-react";

export default function Settings() {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Operational setup notes for the Super Admin portal.</p>
        </div>
      </div>

      <div className="settings-layout simple">
        <section className="dashboard-card settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <ShieldCheck size={19} />
            </div>
            <div>
              <h2>Super Admin Bootstrap</h2>
              <p>No public Super Admin registration exists.</p>
            </div>
          </div>

          <pre className="code-block">
            npm run bootstrap:super-admin
          </pre>
          <p className="settings-note">
            Provide SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD through environment
            variables. Use Application Default Credentials or
            a local service-account file at secrets/service-account.json for
            Firebase Admin SDK access.
          </p>
        </section>

        <section className="dashboard-card settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <Terminal size={19} />
            </div>
            <div>
              <h2>Spark Deployment</h2>
              <p>Deploy Firestore rules and the web app. Do not deploy Cloud Functions.</p>
            </div>
          </div>

          <pre className="code-block">
            firebase deploy --only firestore:rules
          </pre>
          <p className="settings-note">
            Dispatcher and Super Admin account provisioning uses trusted local
            Admin SDK scripts so the Firebase project can remain on Spark.
          </p>
        </section>

        <section className="dashboard-card settings-section">
          <div className="settings-section-heading">
            <div className="settings-section-icon">
              <SettingsIcon size={19} />
            </div>
            <div>
              <h2>Configuration</h2>
              <p>Dynamic category and service-area management is not implemented.</p>
            </div>
          </div>

          <p className="settings-note">
            Current mobile category/division behavior is preserved. Add a
            canonical Firestore configuration model before enabling editable
            categories or service areas here.
          </p>
        </section>
      </div>
    </>
  );
}
