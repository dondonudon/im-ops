import { describe, expect, it, vi } from "vitest";
import { countPdfPages, FIT_SCALES, renderPdfToFit } from "../pdfFit";

/** Build a Blob whose bytes contain `n` `/Type /Page` markers (plus the tree root). */
function fakePdfBlob(pages: number): Blob {
	const body = ["1 0 obj", `<< /Type /Pages /Count ${pages} >>`, "endobj"]
		.concat(Array.from({ length: pages }, (_, i) => `${i + 2} 0 obj\n<< /Type /Page >>\nendobj`))
		.join("\n");
	return new Blob([body], { type: "application/pdf" });
}

describe("countPdfPages", () => {
	it("counts /Type /Page markers", async () => {
		expect(await countPdfPages(fakePdfBlob(1))).toBe(1);
		expect(await countPdfPages(fakePdfBlob(2))).toBe(2);
		expect(await countPdfPages(fakePdfBlob(5))).toBe(5);
	});

	it("does not count the /Type /Pages tree root", async () => {
		const blob = new Blob(["<< /Type /Pages /Count 0 >>"], { type: "application/pdf" });
		// No real page objects → falls back to 1.
		expect(await countPdfPages(blob)).toBe(1);
	});
});

describe("renderPdfToFit", () => {
	it("returns the default (scale 1) render when it already fits on one page", async () => {
		const makeBlob = vi.fn(async () => fakePdfBlob(1));
		await renderPdfToFit(makeBlob);
		// First scale rendered; no need to try smaller ones.
		expect(makeBlob).toHaveBeenCalledTimes(1);
		expect(makeBlob).toHaveBeenCalledWith(1);
	});

	it("shrinks until a single page fits", async () => {
		// 2 pages at scales 1 and 0.95, then fits at 0.9.
		const makeBlob = vi.fn(async (scale: number) => fakePdfBlob(scale <= 0.9 ? 1 : 2));
		await renderPdfToFit(makeBlob);
		expect(makeBlob).toHaveBeenNthCalledWith(1, 1);
		expect(makeBlob).toHaveBeenNthCalledWith(2, 0.95);
		expect(makeBlob).toHaveBeenNthCalledWith(3, 0.9);
		expect(makeBlob).toHaveBeenCalledTimes(3);
	});

	it("falls back to the smallest scale when nothing fits", async () => {
		const makeBlob = vi.fn(async () => fakePdfBlob(2));
		const result = await renderPdfToFit(makeBlob);
		expect(makeBlob).toHaveBeenCalledTimes(FIT_SCALES.length);
		expect(makeBlob).toHaveBeenLastCalledWith(FIT_SCALES[FIT_SCALES.length - 1]);
		expect(await countPdfPages(result)).toBe(2);
	});
});
