// Dashboard — All Projects landing page.
// Two-column: NewProjectForm (left) + RecentProjects + QuickstartRow (right).

const QUICKSTART_PRESETS = [
  { id: "qs-prd",     name: "PRD → Technical Design",   icon: "doc-code", defaultTemplateId: "tpl-prd2tech", description: "Parse a PRD and produce the full technical design." },
  { id: "qs-bugfix",  name: "Bug Root Cause & Fix",     icon: "alert",    defaultTemplateId: "tpl-bugfix",   description: "Reproduce, root-cause, patch, and post-mortem." },
  { id: "qs-compete", name: "Competitor Matrix",        icon: "grid",     defaultTemplateId: "tpl-research", description: "Collect and compare competitors on key dimensions." },
  { id: "qs-launch",  name: "Launch Readiness",         icon: "rocket",   defaultTemplateId: "tpl-launch",   description: "GTM checklist, risk review, launch comms." },
];

function Dashboard({ store, onOpenProject, onQuickstart }) {
  return (
    <div className="dashboard">
      <div className="dashboard-left">
        <div className="ds-card">Placeholder: NewProjectForm</div>
      </div>
      <div className="dashboard-right">
        <div className="ds-card">Placeholder: RecentProjects</div>
        <div className="ds-card">Placeholder: QuickstartRow</div>
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, QUICKSTART_PRESETS });
