export default function PlaceholderPage({
  title,
}: {
  title: string;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{title}</h1>

          <p>
            ServicePilot administrator module
          </p>
        </div>
      </div>

      <div className="dashboard-card placeholder-card">
        <h2>{title}</h2>

        <p>
          This module will be developed in the next phase.
        </p>
      </div>
    </>
  );
}