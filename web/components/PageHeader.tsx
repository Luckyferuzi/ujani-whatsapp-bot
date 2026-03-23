import { clsx } from "clsx";

export default function PageHeader({
  section,
  title,
  description,
  eyebrow,
  actions,
  compact = false,
}: {
  section?: string;
  title: string;
  description?: string;
  eyebrow?: string;
  actions?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={clsx("page-header", compact && "page-header--compact")}>
      <div className="page-header__copy">
        <div className="page-header__eyebrow">{eyebrow || section || "Workspace"}</div>
        <div className="page-header__title-row">
          <h1 className="page-header__title">{title}</h1>
          {section ? <span className="page-header__section">{section}</span> : null}
        </div>
        {description ? <p className="page-header__description">{description}</p> : null}
      </div>
      {actions ? <div className="page-header__actions">{actions}</div> : null}
    </section>
  );
}
