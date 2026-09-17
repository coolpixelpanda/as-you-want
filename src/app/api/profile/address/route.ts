import { NextRequest } from "next/server";
import { formatLocationLine, normalizeStateCode, stateName } from "@/lib/us-states";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export type AddressHit = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  label: string;
};

function titleCase(value: string) {
  return String(value || "")
    .toLowerCase()
    .replace(/\b([a-z])/g, (letter) => letter.toUpperCase());
}

function streetLine(parts: { number?: string; name?: string; type?: string }) {
  return [parts.number, titleCase([parts.name, parts.type].filter(Boolean).join(" "))].filter(Boolean).join(" ").trim();
}

function asHit(row: Partial<AddressHit>): AddressHit | null {
  const city = titleCase(row.city || "");
  const state = normalizeStateCode(row.state || "");
  const street = String(row.street || "").replace(/\s+/g, " ").trim();
  const postalCode = String(row.postalCode || "").trim();
  if (!street || !city || !state) return null;
  const country = row.country || "United States";
  return {
    street,
    city,
    state,
    postalCode,
    country,
    label: [street, city, stateName(state), postalCode].filter(Boolean).join(", "),
  };
}

function uniqueHits(rows: AddressHit[]) {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const key = `${row.street}|${row.city}|${row.state}|${row.postalCode}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function fromPhoton(query: string): Promise<AddressHit[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "8");
  url.searchParams.set("lang", "en");
  const res = await fetch(url, {
    headers: { "User-Agent": "JobLink/1.0 (address lookup)" },
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    features?: { properties?: Record<string, string> }[];
  };
  return (data.features || [])
    .map((feature) => {
      const props = feature.properties || {};
      if (props.countrycode && props.countrycode.toUpperCase() !== "US") return null;
      return asHit({
        street: streetLine({ number: props.housenumber, name: props.street || props.name }),
        city: props.city || props.county,
        state: props.state,
        postalCode: props.postcode,
        country: props.country || "United States",
      });
    })
    .filter((row): row is AddressHit => Boolean(row));
}

async function fromCensus(query: string): Promise<AddressHit[]> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
  url.searchParams.set("address", query);
  url.searchParams.set("benchmark", "Public_AR_Current");
  url.searchParams.set("format", "json");
  const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    result?: {
      addressMatches?: {
        matchedAddress?: string;
        addressComponents?: Record<string, string>;
      }[];
    };
  };
  return (data.result?.addressMatches || [])
    .map((match) => {
      const parts = match.addressComponents || {};
      return asHit({
        street: streetLine({
          number: parts.fromAddress,
          name: parts.streetName,
          type: parts.suffixType,
        }),
        city: parts.city,
        state: parts.state,
        postalCode: parts.zip,
        country: "United States",
      });
    })
    .filter((row): row is AddressHit => Boolean(row));
}

export async function GET(request: NextRequest) {
  const query = String(request.nextUrl.searchParams.get("q") || "").trim();
  if (query.length < 5) return Response.json({ suggestions: [], postalCodes: [] });
  const [photon, census] = await Promise.all([fromPhoton(query).catch(() => []), fromCensus(query).catch(() => [])]);
  const suggestions = uniqueHits([...photon, ...census]).slice(0, 8);
  const postalCodes = [...new Set(suggestions.map((row) => row.postalCode).filter(Boolean))];
  return Response.json(
    { suggestions, postalCodes, locationLine: suggestions[0] ? formatLocationLine(suggestions[0].city, suggestions[0].state) : "" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
