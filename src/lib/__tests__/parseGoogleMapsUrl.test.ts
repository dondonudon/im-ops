import { describe, expect, it } from "vitest";
import {
	extractAddressFromMapsUrl,
	extractCoordsFromHtml,
	isShortGoogleMapsUrl,
	parseGoogleMapsUrl,
} from "@/lib/parseGoogleMapsUrl";

describe("parseGoogleMapsUrl", () => {
	it("reads ?q=lat,lng", () => {
		expect(parseGoogleMapsUrl("https://maps.google.com/?q=-6.98,110.41")).toEqual({
			lat: -6.98,
			lng: 110.41,
		});
	});

	it("reads /@lat,lng,zoom", () => {
		expect(parseGoogleMapsUrl("https://www.google.com/maps/place/X/@-6.9859,110.4143,15z")).toEqual(
			{ lat: -6.9859, lng: 110.4143 },
		);
	});

	it("reads ?ll=lat,lng", () => {
		expect(parseGoogleMapsUrl("https://maps.google.com/?ll=1.23,4.56")).toEqual({
			lat: 1.23,
			lng: 4.56,
		});
	});

	it("returns null when q is a place name (modern share link)", () => {
		expect(
			parseGoogleMapsUrl("https://www.google.com/maps?q=Parama+Graha+Condominium,+Semarang"),
		).toBeNull();
	});

	it("returns null for junk", () => {
		expect(parseGoogleMapsUrl("not a url")).toBeNull();
	});
});

describe("isShortGoogleMapsUrl", () => {
	it("detects maps.app.goo.gl and goo.gl/maps", () => {
		expect(isShortGoogleMapsUrl("https://maps.app.goo.gl/aMw4HVzNbgnbtMdGA")).toBe(true);
		expect(isShortGoogleMapsUrl("https://goo.gl/maps/abc")).toBe(true);
		expect(isShortGoogleMapsUrl("https://www.google.com/maps?q=x")).toBe(false);
	});
});

describe("extractAddressFromMapsUrl", () => {
	it("decodes the place name from ?q= (modern share link)", () => {
		expect(
			extractAddressFromMapsUrl(
				"https://www.google.com/maps?q=Parama+Graha+Condominium,+Semarang&ftid=0x2e:0x18",
			),
		).toBe("Parama Graha Condominium, Semarang");
	});

	it("ignores q= when it's a bare lat,lng", () => {
		expect(extractAddressFromMapsUrl("https://maps.google.com/?q=-6.98,110.41")).toBeNull();
	});

	it("returns null when there's no q/query/destination", () => {
		expect(extractAddressFromMapsUrl("https://www.google.com/maps/@-6.98,110.41,15z")).toBeNull();
	});
});

describe("extractCoordsFromHtml", () => {
	it("extracts from the static-map center (URL-encoded comma)", () => {
		const html = `<img src="https://maps.google.com/maps/api/staticmap?center=-6.9859062%2C110.41430395&amp;zoom=15">`;
		expect(extractCoordsFromHtml(html)).toEqual({ lat: -6.9859062, lng: 110.41430395 });
	});

	it("extracts from the static-map center (plain comma)", () => {
		const html = `x staticmap?center=1.5,103.7&zoom=15 x`;
		expect(extractCoordsFromHtml(html)).toEqual({ lat: 1.5, lng: 103.7 });
	});

	it("falls back to @lat,lng", () => {
		expect(extractCoordsFromHtml("blah /@-7.25,112.75,17z blah")).toEqual({
			lat: -7.25,
			lng: 112.75,
		});
	});

	it("falls back to !3dLAT!4dLNG", () => {
		expect(extractCoordsFromHtml("data=!3d-6.2!4d106.8!2m")).toEqual({ lat: -6.2, lng: 106.8 });
	});

	it("returns null when no coordinates are present", () => {
		expect(extractCoordsFromHtml("<html>no coords here</html>")).toBeNull();
	});
});
