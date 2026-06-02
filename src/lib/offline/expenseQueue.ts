/**
 * Client-only offline expense queue.
 *
 * Moving operators routinely lose connectivity (basements, elevators, rural
 * routes). When an expense insert fails — or the network is already known
 * to be offline — we stash the payload in localStorage and drain it later.
 *
 * Photos are intentionally NOT queued: the blob storage path is binary and
 * heavy, and the caller can re-attach the receipt once back online.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export type QueuedExpense = {
	id: string; // local uuid for dedupe
	job_id: string;
	amount: number;
	category: string;
	description: string | null;
	incurred_at: string;
	queued_at: number;
};

const STORAGE_KEY = "im-ops:offline-expense-queue:v1";

function safeStorage(): Storage | null {
	if (typeof window === "undefined") return null;
	try {
		return window.localStorage;
	} catch {
		return null;
	}
}

function read(): QueuedExpense[] {
	const s = safeStorage();
	if (!s) return [];
	try {
		const raw = s.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as QueuedExpense[]) : [];
	} catch {
		return [];
	}
}

function write(items: QueuedExpense[]) {
	const s = safeStorage();
	if (!s) return;
	try {
		s.setItem(STORAGE_KEY, JSON.stringify(items));
	} catch {
		// Storage quota or private mode — silently drop. We intentionally
		// don't surface this so the operator's primary action still feels fast.
	}
}

export function listQueued(): QueuedExpense[] {
	return read();
}

export function queuedCount(): number {
	return read().length;
}

export function enqueueExpense(expense: Omit<QueuedExpense, "id" | "queued_at">): QueuedExpense {
	const entry: QueuedExpense = {
		...expense,
		id: crypto.randomUUID(),
		queued_at: Date.now(),
	};
	write([...read(), entry]);
	notify();
	return entry;
}

export function removeQueued(id: string) {
	write(read().filter((e) => e.id !== id));
	notify();
}

/**
 * Attempt to drain the queue. Returns counts so the caller can toast/log.
 * Items that still fail stay in the queue for the next attempt.
 */
export async function flushQueue(
	supabase: SupabaseClient<Database>,
): Promise<{ succeeded: number; failed: number; remaining: number }> {
	const items = read();
	if (items.length === 0) return { succeeded: 0, failed: 0, remaining: 0 };

	const payload = items.map((item) => ({
		job_id: item.job_id,
		amount: item.amount,
		category: item.category,
		description: item.description,
		incurred_at: item.incurred_at,
	}));

	// Try batch insert first — one round-trip for the common case.
	const { error: batchError } = await supabase.from("expenses").insert(payload);
	if (!batchError) {
		write([]);
		notify();
		return { succeeded: items.length, failed: 0, remaining: 0 };
	}

	// Batch failed — fall back to individual inserts to isolate which items succeed.
	let succeeded = 0;
	const stillPending: QueuedExpense[] = [];
	for (const item of items) {
		const { error } = await supabase.from("expenses").insert({
			job_id: item.job_id,
			amount: item.amount,
			category: item.category,
			description: item.description,
			incurred_at: item.incurred_at,
		});
		if (error) stillPending.push(item);
		else succeeded += 1;
	}

	write(stillPending);
	notify();
	return {
		succeeded,
		failed: stillPending.length,
		remaining: stillPending.length,
	};
}

// ── change subscription ──────────────────────────────────────────────────
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribe(listener: Listener): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

function notify() {
	for (const l of listeners) l();
}

/**
 * Treats a thrown error as a network/offline failure (so we should queue
 * rather than surface to the operator). Conservative — we treat unknown
 * non-PostgrestErrors as offline too, since they're usually fetch failures.
 */
export function isOfflineError(err: unknown): boolean {
	if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
	if (err instanceof TypeError) return true; // fetch network error
	if (err && typeof err === "object" && "message" in err) {
		const msg = String((err as { message: unknown }).message).toLowerCase();
		if (msg.includes("network") || msg.includes("failed to fetch")) return true;
	}
	return false;
}
