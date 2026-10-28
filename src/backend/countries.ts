// Countries the product is sold in: the name to show, the calling code to
// complete local numbers with, and which price region it falls in. Safe to
// import from browser code.

export interface Country {
  code: string;
  name: string;
  /** Calling code without the plus. */
  dial: string;
}

export const COUNTRIES: Country[] = [
  { code: "US", name: "United States", dial: "1" },
  { code: "CA", name: "Canada", dial: "1" },
  { code: "GB", name: "United Kingdom", dial: "44" },
  { code: "IE", name: "Ireland", dial: "353" },
  { code: "AU", name: "Australia", dial: "61" },
  { code: "NZ", name: "New Zealand", dial: "64" },
  { code: "DE", name: "Germany", dial: "49" },
  { code: "FR", name: "France", dial: "33" },
  { code: "ES", name: "Spain", dial: "34" },
  { code: "IT", name: "Italy", dial: "39" },
  { code: "NL", name: "Netherlands", dial: "31" },
  { code: "BE", name: "Belgium", dial: "32" },
  { code: "CH", name: "Switzerland", dial: "41" },
  { code: "SE", name: "Sweden", dial: "46" },
  { code: "NO", name: "Norway", dial: "47" },
  { code: "DK", name: "Denmark", dial: "45" },
  { code: "FI", name: "Finland", dial: "358" },
  { code: "PT", name: "Portugal", dial: "351" },
  { code: "PL", name: "Poland", dial: "48" },
  { code: "AE", name: "United Arab Emirates", dial: "971" },
  { code: "SA", name: "Saudi Arabia", dial: "966" },
  { code: "IL", name: "Israel", dial: "972" },
  { code: "TR", name: "Türkiye", dial: "90" },
  { code: "SG", name: "Singapore", dial: "65" },
  { code: "HK", name: "Hong Kong", dial: "852" },
  { code: "JP", name: "Japan", dial: "81" },
  { code: "KR", name: "South Korea", dial: "82" },
  { code: "MY", name: "Malaysia", dial: "60" },
  { code: "ZA", name: "South Africa", dial: "27" },
  { code: "MX", name: "Mexico", dial: "52" },
  { code: "BR", name: "Brazil", dial: "55" },
  { code: "AR", name: "Argentina", dial: "54" },
  { code: "CL", name: "Chile", dial: "56" },
  { code: "CO", name: "Colombia", dial: "57" },
  { code: "PE", name: "Peru", dial: "51" },
  { code: "NG", name: "Nigeria", dial: "234" },
  { code: "GH", name: "Ghana", dial: "233" },
  { code: "KE", name: "Kenya", dial: "254" },
  { code: "UG", name: "Uganda", dial: "256" },
  { code: "TZ", name: "Tanzania", dial: "255" },
  { code: "RW", name: "Rwanda", dial: "250" },
  { code: "ZM", name: "Zambia", dial: "260" },
  { code: "ZW", name: "Zimbabwe", dial: "263" },
  { code: "MW", name: "Malawi", dial: "265" },
  { code: "MZ", name: "Mozambique", dial: "258" },
  { code: "BW", name: "Botswana", dial: "267" },
  { code: "SN", name: "Senegal", dial: "221" },
  { code: "CI", name: "Côte d'Ivoire", dial: "225" },
  { code: "CM", name: "Cameroon", dial: "237" },
  { code: "ET", name: "Ethiopia", dial: "251" },
  { code: "EG", name: "Egypt", dial: "20" },
  { code: "MA", name: "Morocco", dial: "212" },
  { code: "IN", name: "India", dial: "91" },
  { code: "PK", name: "Pakistan", dial: "92" },
  { code: "BD", name: "Bangladesh", dial: "880" },
  { code: "LK", name: "Sri Lanka", dial: "94" },
  { code: "NP", name: "Nepal", dial: "977" },
  { code: "PH", name: "Philippines", dial: "63" },
  { code: "ID", name: "Indonesia", dial: "62" },
  { code: "VN", name: "Vietnam", dial: "84" },
  { code: "KH", name: "Cambodia", dial: "855" },
  { code: "BO", name: "Bolivia", dial: "591" },
  { code: "HN", name: "Honduras", dial: "504" },
  { code: "NI", name: "Nicaragua", dial: "505" },
  { code: "JM", name: "Jamaica", dial: "1" },
];

export function countryByCode(code: string | null | undefined): Country | undefined {
  const c = (code ?? "").trim().toUpperCase();
  return COUNTRIES.find((x) => x.code === c);
}

/** The one country with this calling code, or undefined when several share it (+1) or none do. */
export function countryByDial(dial: string | null | undefined): Country | undefined {
  const d = (dial ?? "").replace(/\D/g, "");
  const matches = COUNTRIES.filter((x) => x.dial === d);
  return matches.length === 1 ? matches[0] : undefined;
}

// ---------------------------------------------------------------------------
// Price regions
// ---------------------------------------------------------------------------

export type PriceRegion = "default" | "emerging";

export const PRICE_REGIONS: { id: PriceRegion; label: string }[] = [
  { id: "default", label: "Everywhere (standard prices)" },
  { id: "emerging", label: "Emerging markets (regional prices)" },
];

/** Where regional prices apply. The prices themselves are the payment links the owner adds for this region. */
const EMERGING = new Set([
  "NG", "GH", "KE", "UG", "TZ", "RW", "ZM", "ZW", "MW", "MZ", "BW", "SN", "CI", "CM", "ET", "EG", "MA",
  "IN", "PK", "BD", "LK", "NP", "PH", "ID", "VN", "KH", "BO", "HN", "NI",
]);

export function regionForCountry(code: string | null | undefined): PriceRegion {
  return EMERGING.has((code ?? "").trim().toUpperCase()) ? "emerging" : "default";
}
