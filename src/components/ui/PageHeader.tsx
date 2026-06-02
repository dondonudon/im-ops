/** Standard page title block with optional subtitle and right-aligned actions. */
export function PageHeader({
	title,
	subtitle,
	actions,
}: {
	title: React.ReactNode;
	subtitle?: React.ReactNode;
	actions?: React.ReactNode;
}) {
	return (
		<div className="flex items-start justify-between flex-wrap gap-3">
			<div>
				<h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
				{subtitle && <p className="text-sm text-ink-muted mt-0.5">{subtitle}</p>}
			</div>
			{actions && <div className="flex items-center gap-2">{actions}</div>}
		</div>
	);
}
