"use client";

import { useRef } from "react";

export function FilterForm({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const ref = useRef<HTMLFormElement>(null);

	return (
		<form
			ref={ref}
			method="GET"
			autoComplete="off"
			className={className}
			onChange={(e) => {
				const el = e.target as HTMLInputElement;
				if (el.tagName === "SELECT" || (el.tagName === "INPUT" && el.type === "date")) {
					ref.current?.requestSubmit();
				}
			}}
		>
			{children}
		</form>
	);
}
