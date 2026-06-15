"use client";

interface ObfuscatedEmailProps {
	user: string;
	domain: string;
	className?: string;
}

export function ObfuscatedEmail({ user, domain, className }: ObfuscatedEmailProps) {
	const email = `${user}@${domain}`;
	return (
		<a href={`mailto:${email}`} className={className}>
			{email}
		</a>
	);
}
