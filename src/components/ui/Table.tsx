import { cn } from "@/lib/utils";

/**
 * Token-styled table primitives. Compose with the desktop-table /
 * mobile-card-list pattern: render <Table> inside `hidden md:block` and a
 * stacked card list inside `md:hidden` for field/touch use.
 */
export function Table({
	className,
	children,
	...props
}: React.TableHTMLAttributes<HTMLTableElement>) {
	return (
		<div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-token">
			<table className={cn("w-full text-sm", className)} {...props}>
				{children}
			</table>
		</div>
	);
}

export function THead({ children }: { children: React.ReactNode }) {
	return (
		<thead className="border-b border-line bg-subtle">
			<tr>{children}</tr>
		</thead>
	);
}

export function TH({
	children,
	align = "left",
	className,
}: {
	children?: React.ReactNode;
	align?: "left" | "right" | "center";
	className?: string;
}) {
	return (
		<th
			scope="col"
			className={cn(
				"px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-muted",
				align === "right" && "text-right",
				align === "center" && "text-center",
				align === "left" && "text-left",
				className,
			)}
		>
			{children}
		</th>
	);
}

export function TBody({ children }: { children: React.ReactNode }) {
	return <tbody className="divide-y divide-line">{children}</tbody>;
}

export function TR({ children, className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
	return (
		<tr className={cn("transition-colors hover:bg-subtle", className)} {...props}>
			{children}
		</tr>
	);
}

export function TD({
	children,
	align = "left",
	className,
	...props
}: React.TdHTMLAttributes<HTMLTableCellElement> & {
	align?: "left" | "right" | "center";
}) {
	return (
		<td
			className={cn(
				"px-4 py-3 text-ink",
				align === "right" && "text-right tabular-nums",
				align === "center" && "text-center",
				className,
			)}
			{...props}
		>
			{children}
		</td>
	);
}
