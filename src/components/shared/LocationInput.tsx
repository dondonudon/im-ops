"use client";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import { Link2, Loader2, MapPin, Navigation, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import usePlacesAutocomplete, { getGeocode, getLatLng } from "use-places-autocomplete";
import { resolveMapUrl } from "@/app/actions/resolveMapUrl";
import { isShortGoogleMapsUrl, parseGoogleMapsUrl } from "@/lib/parseGoogleMapsUrl";
import { cn } from "@/lib/utils";

// Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your .env.local to enable this component
const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
const LIBRARIES: ["places"] = ["places"];
const JAKARTA = { lat: -6.2088, lng: 106.8456 };

export interface LocationValue {
	address: string;
	lat: number | null;
	lng: number | null;
}

interface LocationInputProps {
	id?: string;
	value: LocationValue;
	onChange: (v: LocationValue) => void;
	placeholder?: string;
	className?: string;
}

const controlBase =
	"w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-transparent disabled:opacity-60 disabled:cursor-not-allowed";

type Mode = "search" | "map" | "paste";

export function LocationInput({ id, value, onChange, placeholder, className }: LocationInputProps) {
	const { isLoaded } = useLoadScript({
		googleMapsApiKey: MAPS_API_KEY,
		libraries: LIBRARIES,
	});

	if (!isLoaded) {
		return (
			<div className={cn(controlBase, "flex items-center gap-2 text-ink-faint", className)}>
				<Loader2 size={14} className="animate-spin shrink-0" aria-hidden="true" />
				<span>Loading maps…</span>
			</div>
		);
	}

	return (
		<LocationInputInner
			id={id}
			value={value}
			onChange={onChange}
			placeholder={placeholder}
			className={className}
		/>
	);
}

function LocationInputInner({ id, value, onChange, placeholder, className }: LocationInputProps) {
	const [mode, setMode] = useState<Mode>("search");
	const [mapOpen, setMapOpen] = useState(false);
	const [pinPos, setPinPos] = useState<google.maps.LatLngLiteral>(
		value.lat && value.lng ? { lat: value.lat, lng: value.lng } : JAKARTA,
	);
	const [pinAddress, setPinAddress] = useState(value.address);
	const [pasteValue, setPasteValue] = useState("");
	const [pasteError, setPasteError] = useState<string | null>(null);
	const [pasteLoading, setPasteLoading] = useState(false);
	const geocoderRef = useRef<google.maps.Geocoder | null>(null);

	const {
		ready,
		value: searchValue,
		setValue: setSearchValue,
		suggestions: { status, data },
		clearSuggestions,
	} = usePlacesAutocomplete({
		debounce: 300,
		defaultValue: value.address,
		requestOptions: { componentRestrictions: { country: "id" } },
	});

	// Sync search input if parent value changes externally
	useEffect(() => {
		setSearchValue(value.address, false);
	}, [value.address, setSearchValue]);

	async function handleSelect(description: string) {
		setSearchValue(description, false);
		clearSuggestions();
		try {
			const results = await getGeocode({ address: description });
			const { lat, lng } = await getLatLng(results[0]);
			onChange({ address: description.toUpperCase(), lat, lng });
		} catch {
			onChange({ address: description.toUpperCase(), lat: null, lng: null });
		}
	}

	function handleClear() {
		setSearchValue("", false);
		clearSuggestions();
		onChange({ address: "", lat: null, lng: null });
	}

	// Map picker
	function openMapPicker() {
		setPinPos(value.lat && value.lng ? { lat: value.lat, lng: value.lng } : JAKARTA);
		setPinAddress(value.address);
		setMapOpen(true);
	}

	const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
		if (!e.latLng) return;
		const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
		setPinPos(pos);
		if (!geocoderRef.current) {
			geocoderRef.current = new window.google.maps.Geocoder();
		}
		geocoderRef.current?.geocode({ location: pos }, (results, status) => {
			if (status === "OK" && results?.[0]) {
				setPinAddress(results[0].formatted_address.toUpperCase());
			}
		});
	}, []);

	function confirmMapPin() {
		onChange({
			address: pinAddress || `${pinPos.lat},${pinPos.lng}`,
			lat: pinPos.lat,
			lng: pinPos.lng,
		});
		setMapOpen(false);
	}

	// Paste link handler
	async function handlePasteResolve() {
		const trimmed = pasteValue.trim();
		if (!trimmed) return;
		setPasteError(null);
		setPasteLoading(true);
		try {
			let coords = parseGoogleMapsUrl(trimmed);
			if (!coords && isShortGoogleMapsUrl(trimmed)) {
				coords = await resolveMapUrl(trimmed);
			}
			if (!coords) {
				setPasteError("Could not extract coordinates from this link.");
				return;
			}
			// Reverse geocode to get address
			if (!geocoderRef.current) {
				geocoderRef.current = new window.google.maps.Geocoder();
			}
			if (geocoderRef.current) {
				geocoderRef.current.geocode({ location: coords }, (results, status) => {
					const address =
						status === "OK" && results?.[0]
							? results[0].formatted_address.toUpperCase()
							: `${coords!.lat},${coords!.lng}`;
					onChange({ address, lat: coords!.lat, lng: coords!.lng });
					setPasteValue("");
					setMode("search");
					setSearchValue(address, false);
				});
			} else {
				onChange({ address: `${coords.lat},${coords.lng}`, lat: coords.lat, lng: coords.lng });
				setPasteValue("");
				setMode("search");
			}
		} finally {
			setPasteLoading(false);
		}
	}

	return (
		<div className={cn("space-y-1.5", className)}>
			{/* Search mode */}
			{mode === "search" && (
				<div className="relative">
					<div className="relative">
						<input
							id={id}
							className={cn(controlBase, "pr-8 uppercase")}
							value={searchValue}
							onChange={(e) => setSearchValue(e.target.value.toUpperCase())}
							placeholder={placeholder ?? "Search address…"}
							disabled={!ready}
							autoComplete="off"
						/>
						{searchValue && (
							<button
								type="button"
								onClick={handleClear}
								className="absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink transition-colors"
								aria-label="Clear address"
							>
								<X size={14} aria-hidden="true" />
							</button>
						)}
					</div>

					{/* Autocomplete dropdown */}
					{status === "OK" && (
						<ul className="absolute z-50 mt-1 w-full rounded-lg border border-line bg-surface shadow-token-md overflow-hidden">
							{data.map(({ place_id, description }) => (
								<li key={place_id}>
									<button
										type="button"
										className="w-full px-3 py-2.5 text-left text-sm text-ink hover:bg-subtle transition-colors flex items-start gap-2"
										onClick={() => handleSelect(description)}
									>
										<MapPin
											size={13}
											className="mt-0.5 shrink-0 text-ink-muted"
											aria-hidden="true"
										/>
										<span>{description}</span>
									</button>
								</li>
							))}
						</ul>
					)}

					{/* Coordinate badge */}
					{value.lat && value.lng && (
						<p className="text-xs text-ink-faint mt-1 flex items-center gap-1">
							<Navigation size={11} aria-hidden="true" />
							{value.lat.toFixed(5)}, {value.lng.toFixed(5)}
						</p>
					)}
				</div>
			)}

			{/* Paste mode */}
			{mode === "paste" && (
				<div className="space-y-1.5">
					<div className="flex gap-2">
						<input
							className={cn(controlBase, "flex-1")}
							value={pasteValue}
							onChange={(e) => {
								setPasteValue(e.target.value);
								setPasteError(null);
							}}
							placeholder="Paste Google Maps link…"
						/>
						<button
							type="button"
							onClick={handlePasteResolve}
							disabled={!pasteValue.trim() || pasteLoading}
							className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg text-sm font-semibold bg-primary text-primary-fg hover:bg-primary-hover disabled:opacity-50 disabled:pointer-events-none transition-all"
						>
							{pasteLoading ? (
								<Loader2 size={13} className="animate-spin" aria-hidden="true" />
							) : (
								"Use"
							)}
						</button>
						<button
							type="button"
							onClick={() => {
								setMode("search");
								setPasteError(null);
								setPasteValue("");
							}}
							className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-sm font-semibold bg-surface text-ink border border-line hover:bg-subtle transition-all"
						>
							Cancel
						</button>
					</div>
					{pasteError && <p className="text-xs text-danger">{pasteError}</p>}
				</div>
			)}

			{/* Action row */}
			{mode === "search" && (
				<div className="flex gap-3">
					<button
						type="button"
						onClick={openMapPicker}
						className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
					>
						<MapPin size={12} aria-hidden="true" />
						Pin on map
					</button>
					<button
						type="button"
						onClick={() => setMode("paste")}
						className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-ink transition-colors"
					>
						<Link2 size={12} aria-hidden="true" />
						Paste Maps link
					</button>
				</div>
			)}

			{/* Map picker modal */}
			{mapOpen && (
				// biome-ignore lint/a11y/useKeyWithClickEvents: Escape key handled via keydown on dialog
				// biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-close is standard modal UX
				<div
					className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
					onClick={(e) => {
						if (e.target === e.currentTarget) setMapOpen(false);
					}}
				>
					<div
						role="dialog"
						aria-modal="true"
						aria-label="Pin location on map"
						className="bg-surface rounded-xl shadow-token-lg w-full max-w-2xl flex flex-col overflow-hidden"
						onClick={(e) => e.stopPropagation()}
						onKeyDown={(e) => {
							if (e.key === "Escape") setMapOpen(false);
						}}
					>
						<div className="flex items-center justify-between px-4 py-3 border-b border-line">
							<h2 className="text-sm font-semibold text-ink">Pin location</h2>
							<button
								type="button"
								onClick={() => setMapOpen(false)}
								aria-label="Close map"
								className="text-ink-faint hover:text-ink transition-colors"
							>
								<X size={16} aria-hidden="true" />
							</button>
						</div>

						<GoogleMap
							mapContainerStyle={{ width: "100%", height: "400px" }}
							center={pinPos}
							zoom={14}
							onClick={handleMapClick}
							options={{ disableDefaultUI: false, streetViewControl: false, mapTypeControl: false }}
						>
							<Marker position={pinPos} draggable onDragEnd={handleMapClick} />
						</GoogleMap>

						<div className="px-4 py-3 border-t border-line space-y-2">
							{pinAddress && <p className="text-xs text-ink-muted truncate">{pinAddress}</p>}
							<div className="flex gap-2 justify-end">
								<button
									type="button"
									onClick={() => setMapOpen(false)}
									className="inline-flex items-center h-9 px-3.5 rounded-lg text-sm font-semibold bg-surface text-ink border border-line hover:bg-subtle transition-all"
								>
									Cancel
								</button>
								<button
									type="button"
									onClick={confirmMapPin}
									className="inline-flex items-center h-9 px-3.5 rounded-lg text-sm font-semibold bg-primary text-primary-fg hover:bg-primary-hover transition-all"
								>
									Confirm location
								</button>
							</div>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
