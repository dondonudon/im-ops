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
			className={className}
			onChange={(e) => {
				if ((e.target as HTMLElement).tagName === "SELECT") {
					ref.current?.requestSubmit();
				}
			}}
		>
			{children}
		</form>
	);
}
