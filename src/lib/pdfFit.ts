/**
 * Fit-to-one-page helpers for the single-page documents (proposal / invoice /
 * receipt). These are designed as one page; they only spill onto a second page
 * when the content is edited (extra services, custom conditions, more route
 * stops, a long address). Rather than let them break awkwardly, we render at
 * successively smaller scales until the output is a single page — so the default
 * document is untouched and only over-long content gets gently compacted.
 */

/**
 * Count the pages in a react-pdf `Blob`.
 *
 * react-pdf writes the page dictionaries uncompressed, so each page shows up as a
 * literal `/Type /Page` marker in the raw bytes (the page-tree root is
 * `/Type /Pages`, which the negative lookahead excludes). Reliable for the
 * documents in this app; not a general-purpose PDF page counter.
 */
export async function countPdfPages(blob: Blob): Promise<number> {
	const bytes = new Uint8Array(await blob.arrayBuffer());
	const text = new TextDecoder("latin1").decode(bytes);
	const matches = text.match(/\/Type\s*\/Page(?![s])/g);
	return matches ? matches.length : 1;
}

/** Scales tried by {@link renderPdfToFit}, largest first. 1 = untouched default. */
export const FIT_SCALES = [1, 0.95, 0.9, 0.85, 0.8] as const;

/**
 * Render a document at the largest scale that still fits on a single page.
 *
 * `makeBlob(scale)` renders the document at the given scale and returns its
 * `Blob`. Scales are tried largest-first; the first single-page result wins. If
 * nothing fits (content genuinely too long), the smallest scale's output is
 * returned — combined with the "Halaman X dari Y" footer, a real multi-pager
 * stays legible.
 */
export async function renderPdfToFit(
	makeBlob: (scale: number) => Promise<Blob>,
	scales: readonly number[] = FIT_SCALES,
): Promise<Blob> {
	let blob = await makeBlob(scales[0]);
	for (let i = 1; i < scales.length; i++) {
		if ((await countPdfPages(blob)) <= 1) return blob;
		blob = await makeBlob(scales[i]);
	}
	return blob;
}
