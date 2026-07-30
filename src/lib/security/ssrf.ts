/**
 * Server-side SSRF guards for outbound `fetch` on URLs influenced by user or
 * settings input. Use before fetching any URL that isn't a hardcoded constant.
 */

/**
 * True if the hostname is localhost, a private/link-local/loopback IP literal,
 * or otherwise not a routable public address. This is a best-effort literal
 * check — it does NOT resolve DNS, so it won't catch a public hostname that
 * resolves to a private IP (DNS rebinding). Combine with a host allowlist when
 * the set of legitimate hosts is known.
 */
export function isPrivateHostname(hostname: string): boolean {
	const host = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // strip IPv6 brackets

	if (host === "localhost" || host.endsWith(".localhost")) return true;
	if (host === "0.0.0.0" || host === "::" || host === "::1") return true;

	// IPv4 literal
	const v4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
	if (v4) {
		const [a, b] = [Number(v4[1]), Number(v4[2])];
		if (a === 10) return true; // 10.0.0.0/8
		if (a === 127) return true; // loopback
		if (a === 0) return true; // 0.0.0.0/8
		if (a === 169 && b === 254) return true; // link-local (incl. cloud metadata)
		if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
		if (a === 192 && b === 168) return true; // 192.168.0.0/16
		if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
		return false;
	}

	// IPv6 literal — block loopback, unique-local (fc00::/7) and link-local (fe80::/10)
	if (host.includes(":")) {
		if (host.startsWith("fc") || host.startsWith("fd")) return true;
		if (
			host.startsWith("fe8") ||
			host.startsWith("fe9") ||
			host.startsWith("fea") ||
			host.startsWith("feb")
		) {
			return true;
		}
		// IPv4-mapped (::ffff:169.254.x.x etc.) — re-check the embedded v4
		const mapped = host.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
		if (mapped) return isPrivateHostname(mapped[1]);
	}

	return false;
}

/**
 * Validates an outbound URL for server-side fetch. Requires https, a non-private
 * host, and (when `allowedHosts` is given) an exact or suffix host match.
 * Returns the parsed URL, or null if the URL is unsafe/disallowed.
 */
export function validateOutboundUrl(
	rawUrl: string,
	opts: { allowedHosts?: string[] } = {},
): URL | null {
	let url: URL;
	try {
		url = new URL(rawUrl.trim());
	} catch {
		return null;
	}

	if (url.protocol !== "https:") return null;
	if (isPrivateHostname(url.hostname)) return null;

	if (opts.allowedHosts && opts.allowedHosts.length > 0) {
		const host = url.hostname.toLowerCase();
		const ok = opts.allowedHosts.some(
			(allowed) => host === allowed || host.endsWith(`.${allowed}`),
		);
		if (!ok) return null;
	}

	return url;
}
