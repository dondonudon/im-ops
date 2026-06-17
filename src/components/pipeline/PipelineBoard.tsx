"use client";

import { GripVertical, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { advanceLead, type Stage } from "@/app/(dashboard)/pipeline/actions";
import { Badge, Money, RouteLine, toneFor } from "@/components/ui";
import { cn, formatRupiah } from "@/lib/utils";

export type PipelineCard = {
	id: string;
	status: string;
	customerName: string;
	pickup: string | null;
	destination: string | null;
	dateLabel: string;
	value: number;
};

export type ColumnsData = Record<Stage, PipelineCard[]>;

const STAGE_ORDER: Stage[] = ["new", "survey", "estimate", "proposal", "won"];

/** Canonical lead.status for the optimistic card while the server confirms. */
const STAGE_STATUS: Record<Stage, string> = {
	new: "new",
	survey: "survey_scheduled",
	estimate: "estimating",
	proposal: "proposal_sent",
	won: "converted",
};

const THRESHOLD = 6; // px before a press becomes a drag
const HANDLE_STYLE: React.CSSProperties = { touchAction: "none", WebkitTouchCallout: "none" };
const EDGE = 52; // px from board edge that triggers auto-scroll

type Press = {
	id: string;
	x: number;
	y: number;
	pointerId: number;
	pointerType: string;
	el: HTMLElement;
	fromHandle: boolean;
	started: boolean;
};

export function PipelineBoard({ initialColumns }: { initialColumns: ColumnsData }) {
	const t = useTranslations("pipeline");
	const tStatus = useTranslations("status.lead");
	const router = useRouter();
	const [, startTransition] = useTransition();

	const [columns, setColumns] = useState<ColumnsData>(initialColumns);
	const [dragId, setDragId] = useState<string | null>(null);
	const [overStage, setOverStage] = useState<Stage | null>(null);
	const [ghost, setGhost] = useState<{ x: number; y: number } | null>(null);
	const [pending, setPending] = useState<Set<string>>(new Set());
	const [notice, setNotice] = useState<string | null>(null);
	const [navigatingId, setNavigatingId] = useState<string | null>(null);

	// Latest-value refs so the window-level pointer handlers never go stale.
	const columnsRef = useRef(columns);
	const pressRef = useRef<Press | null>(null);
	const dragCardRef = useRef<PipelineCard | null>(null);
	const autoDirRef = useRef(0);
	const boardRef = useRef<HTMLDivElement>(null);
	const tRef = useRef(t);
	const routerRef = useRef(router);
	const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		columnsRef.current = columns;
		tRef.current = t;
		routerRef.current = router;
	});

	const flashNotice = useCallback((msg: string) => {
		setNotice(msg);
		if (noticeTimer.current) clearTimeout(noticeTimer.current);
		noticeTimer.current = setTimeout(() => setNotice(null), 3500);
	}, []); // setNotice is stable; noticeTimer is a ref

	const stageAtPoint = useCallback((x: number, y: number): Stage | null => {
		const el = document.elementFromPoint(x, y);
		const col = el?.closest("[data-stage]");
		return (col?.getAttribute("data-stage") as Stage | null) ?? null;
	}, []);

	const activateDrag = useCallback(() => {
		const p = pressRef.current;
		if (!p || p.started) return;
		p.started = true;
		try {
			p.el.setPointerCapture(p.pointerId);
		} catch {
			/* capture is best-effort */
		}
		setDragId(p.id);
		setGhost({ x: p.x, y: p.y });
		if (navigator.vibrate) navigator.vibrate(8);
	}, []); // setDragId/setGhost are stable; pressRef is a ref

	const performDrop = useCallback(
		(id: string, toStage: Stage) => {
			const cols = columnsRef.current;
			let fromStage: Stage | null = null;
			for (const s of STAGE_ORDER) {
				if (cols[s].some((c) => c.id === id)) fromStage = s;
			}
			if (!fromStage || fromStage === toStage) return;
			const card = cols[fromStage].find((c) => c.id === id);
			if (!card) return;

			const prev = cols;
			const moved: PipelineCard = { ...card, status: STAGE_STATUS[toStage] };
			setColumns({
				...cols,
				[fromStage]: cols[fromStage].filter((c) => c.id !== id),
				[toStage]: [moved, ...cols[toStage]],
			});
			setPending((p) => new Set(p).add(id));

			advanceLead(id, toStage).then((result) => {
				setPending((p) => {
					const n = new Set(p);
					n.delete(id);
					return n;
				});
				if (!result.ok) {
					setColumns(prev);
					flashNotice(tRef.current(`notices.${result.reason}` as never));
					return;
				}
				setColumns((cur) => ({
					...cur,
					[toStage]: cur[toStage].map((c) => (c.id === id ? { ...c, status: result.status } : c)),
				}));
				startTransition(() => routerRef.current.refresh());
			});
		},
		[flashNotice],
	); // columnsRef, tRef, routerRef are refs; setters are stable

	/** Keyboard accessibility: move a focused card to the adjacent stage. */
	function moveByKeyboard(id: string, dir: 1 | -1) {
		const cols = columnsRef.current;
		let fromStage: Stage | null = null;
		for (const s of STAGE_ORDER) {
			if (cols[s].some((c) => c.id === id)) fromStage = s;
		}
		if (!fromStage) return;
		const next = STAGE_ORDER.indexOf(fromStage) + dir;
		if (next < 0 || next >= STAGE_ORDER.length) return;
		performDrop(id, STAGE_ORDER[next]);
	}

	// Window-level pointer engine — attached once.
	useEffect(() => {
		function onMove(e: PointerEvent) {
			const p = pressRef.current;
			if (!p) return;
			const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);

			if (!p.started) {
				const canDrag = p.fromHandle || p.pointerType === "mouse" || p.pointerType === "pen";
				if (canDrag && dist > THRESHOLD) {
					activateDrag();
				} else if (!p.fromHandle && p.pointerType === "touch") {
					// Touch on the card body = scroll/tap, never a drag.
					pressRef.current = null;
					return;
				} else {
					return;
				}
				if (!pressRef.current?.started) return;
			}

			// dragging
			e.preventDefault();
			setGhost({ x: e.clientX, y: e.clientY });
			setOverStage(stageAtPoint(e.clientX, e.clientY));

			const board = boardRef.current;
			if (board) {
				const r = board.getBoundingClientRect();
				autoDirRef.current = e.clientX > r.right - EDGE ? 1 : e.clientX < r.left + EDGE ? -1 : 0;
			}
		}

		function onUp(e: PointerEvent) {
			const p = pressRef.current;
			pressRef.current = null;
			autoDirRef.current = 0;
			if (!p) return;

			if (p.started) {
				const toStage = stageAtPoint(e.clientX, e.clientY);
				setDragId(null);
				setGhost(null);
				setOverStage(null);
				dragCardRef.current = null;
				if (toStage) performDrop(p.id, toStage);
			} else if (!p.fromHandle) {
				// Tap (no drag) on the card body → open the lead.
				const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
				if (dist < THRESHOLD) {
					setNavigatingId(p.id);
					routerRef.current.push(`/leads/${p.id}`);
				}
			}
		}

		window.addEventListener("pointermove", onMove, { passive: false });
		window.addEventListener("pointerup", onUp);
		window.addEventListener("pointercancel", onUp);
		return () => {
			window.removeEventListener("pointermove", onMove);
			window.removeEventListener("pointerup", onUp);
			window.removeEventListener("pointercancel", onUp);
		};
	}, [stageAtPoint, performDrop, activateDrag]);

	// Auto-scroll the board horizontally while dragging near an edge.
	useEffect(() => {
		if (!dragId) return;
		let raf = 0;
		const step = () => {
			const el = boardRef.current;
			if (el && autoDirRef.current !== 0) {
				el.scrollLeft += autoDirRef.current * 12;
			}
			raf = requestAnimationFrame(step);
		};
		raf = requestAnimationFrame(step);
		return () => cancelAnimationFrame(raf);
	}, [dragId]);

	function startPress(e: React.PointerEvent, card: PipelineCard, fromHandle: boolean) {
		if (e.button && e.button !== 0) return;
		dragCardRef.current = card;
		pressRef.current = {
			id: card.id,
			x: e.clientX,
			y: e.clientY,
			pointerId: e.pointerId,
			pointerType: e.pointerType,
			el: e.currentTarget as HTMLElement,
			fromHandle,
			started: false,
		};
	}

	return (
		<>
			<div ref={boardRef} className="flex gap-4 overflow-x-auto pb-4 scrollbar-thin snap-x">
				{STAGE_ORDER.map((stage) => {
					const items = columns[stage];
					const colValue = items.reduce((s, c) => s + c.value, 0);
					const isOver = overStage === stage && dragId !== null;
					return (
						<section
							key={stage}
							data-stage={stage}
							className={cn(
								"snap-start shrink-0 w-[290px] flex flex-col rounded-xl border transition-colors",
								isOver
									? "border-primary bg-primary-subtle ring-2 ring-primary"
									: "border-line bg-subtle",
							)}
							aria-label={t(`stages.${stage}` as never)}
						>
							<div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-line">
								<div className="flex items-center gap-2 min-w-0">
									<h2 className="text-sm font-semibold text-ink truncate">
										{t(`stages.${stage}` as never)}
									</h2>
									<span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-surface border border-line px-1.5 text-[11px] font-bold text-ink-muted">
										{items.length}
									</span>
								</div>
								{colValue > 0 && (
									<Money
										value={colValue}
										tone="muted"
										className="text-[11px] font-semibold shrink-0"
									/>
								)}
							</div>

							<div className="flex-1 p-2.5 space-y-2.5 min-h-[140px]">
								{items.length === 0 ? (
									<p className="px-2 py-6 text-center text-xs text-ink-faint select-none">
										{isOver ? t("dropHere") : t("emptyColumn")}
									</p>
								) : (
									items.map((card) => {
										const isPending = pending.has(card.id);
										const isDragging = dragId === card.id;
										const isNavigating = navigatingId === card.id;
										return (
											// biome-ignore lint/a11y/useSemanticElements: contains a nested button (drag handle) — HTML forbids interactive content inside button
											<div
												key={card.id}
												onPointerDown={(e) => startPress(e, card, false)}
												onKeyDown={(e) => {
													if (e.key === "Enter") {
														setNavigatingId(card.id);
														router.push(`/leads/${card.id}`);
													} else if (e.key === "ArrowRight") {
														e.preventDefault();
														moveByKeyboard(card.id, 1);
													} else if (e.key === "ArrowLeft") {
														e.preventDefault();
														moveByKeyboard(card.id, -1);
													}
												}}
												tabIndex={0}
												role="button"
												aria-keyshortcuts="ArrowLeft ArrowRight Enter"
												aria-label={`${card.customerName} — ${tStatus(card.status as never)}`}
												className={cn(
													"relative rounded-lg bg-surface border border-line shadow-token-sm p-3 pr-10 select-none transition-all",
													"hover:border-line-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
													"md:cursor-grab md:active:cursor-grabbing",
													isDragging && "opacity-40",
													isPending && "opacity-60 pointer-events-none",
													isNavigating && "pointer-events-none",
												)}
											>
												{isNavigating && (
													<div className="absolute inset-0 rounded-lg bg-surface/70 flex items-center justify-center z-10">
														<Loader2
															size={18}
															className="animate-spin text-primary"
															aria-hidden="true"
														/>
													</div>
												)}
												{/* Drag handle — the reliable grab target on touch */}
												<button
													type="button"
													aria-label="Drag to move"
													onPointerDown={(e) => {
														e.stopPropagation();
														startPress(e, card, true);
													}}
													onClick={(e) => e.stopPropagation()}
													onContextMenu={(e) => e.preventDefault()}
													style={HANDLE_STYLE}
													className="absolute top-0 right-0 h-full px-2 flex items-center text-ink-faint hover:text-ink cursor-grab active:cursor-grabbing rounded-r-lg hover:bg-subtle"
												>
													<GripVertical size={16} aria-hidden="true" />
												</button>

												<div className="flex items-start justify-between gap-2 mb-2">
													<p className="text-[13px] font-semibold text-ink truncate">
														{card.customerName}
													</p>
													<Badge tone={toneFor("lead", card.status)} dot>
														{tStatus(card.status as never)}
													</Badge>
												</div>
												<RouteLine from={card.pickup} to={card.destination} className="mb-2" />
												<div className="flex items-center justify-between text-xs">
													<span className="text-ink-faint tabular-nums">{card.dateLabel}</span>
													{card.value > 0 && (
														<span className="text-xs font-semibold text-ink tabular-nums">
															{formatRupiah(card.value)}
														</span>
													)}
												</div>
											</div>
										);
									})
								)}
							</div>
						</section>
					);
				})}
			</div>

			{/* Drag ghost — follows the pointer/finger */}
			{ghost && dragCardRef.current && (
				<div
					className="fixed z-[70] w-[260px] pointer-events-none -translate-x-1/2 -translate-y-1/2 rotate-2"
					style={{ left: ghost.x, top: ghost.y }}
				>
					<div className="rounded-lg bg-surface border border-primary shadow-token-md p-3">
						<div className="flex items-center justify-between gap-2 mb-2">
							<p className="text-[13px] font-semibold text-ink truncate">
								{dragCardRef.current.customerName}
							</p>
							<Badge tone={toneFor("lead", dragCardRef.current.status)} dot>
								{tStatus(dragCardRef.current.status as never)}
							</Badge>
						</div>
						<RouteLine from={dragCardRef.current.pickup} to={dragCardRef.current.destination} />
					</div>
				</div>
			)}

			{/* Toast */}
			{notice && (
				<div
					role="status"
					className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[70] rounded-lg bg-ink text-background px-4 py-2.5 text-sm font-medium shadow-token-md animate-fade-in-up"
				>
					{notice}
				</div>
			)}
		</>
	);
}
