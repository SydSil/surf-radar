const COMMON_BEGINNER = {
  sweetMin: 0.6,
  sweetMax: 1.2,
  hardMax: 1.5,
  maxWind: 24,
  tidePreference: "any",
  enabled: true,
  needsCoordinates: false,
  source: "Catalogue Surf Radar"
};

/**
 * Petit catalogue volontairement ciblé sur les destinations utiles depuis Laon.
 * Les coordonnées pointent vers la plage ou l'école de surf, jamais vers un reef
 * secret. Les réglages restent prudents et peuvent être affinés après une session.
 */
export const SPOT_CATALOG = [
  {
    catalogId: "wimereux",
    name: "Wimereux — plage / école de surf",
    lat: 50.763552,
    lon: 1.605747,
    country: "France",
    region: "Côte d’Opale",
    travelHours: 3,
    swellSector: "w",
    offshoreSector: "se",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=50.763552%2C1.605747",
    notes: "Spot avec école labellisée. Préréglage débutant prudent ; vérifier courants, marée et zone surveillée sur place.",
    sourceLabel: "Wimereux Surf School",
    sourceUrl: "https://www.wimereuxsurfschool.com/"
  },
  {
    catalogId: "wissant",
    name: "Wissant — plage",
    lat: 50.886111,
    lon: 1.663611,
    country: "France",
    region: "Côte d’Opale",
    travelHours: 3.25,
    swellSector: "w",
    offshoreSector: "se",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=50.886111%2C1.663611",
    notes: "Grande baie exposée et souvent ventée. Rester très prudent avec le shorebreak, les courants et les jours de vent fort.",
    sourceLabel: "École de Surf du Nord",
    sourceUrl: "https://www.ecolesurfnord.fr/"
  },
  {
    catalogId: "blankenberge",
    name: "Blankenberge — plage du Pier",
    lat: 51.318881,
    lon: 3.13839,
    country: "Belgique",
    region: "Flandre",
    travelHours: 3.75,
    swellSector: "nw",
    offshoreSector: "se",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=51.318881%2C3.138390",
    notes: "Spot belge très connu. Pour un niveau débutant, garder une large distance avec le pier, les épis et leurs courants.",
    sourceLabel: "VISITFLANDERS",
    sourceUrl: "https://www.visitflanders.com/en/inspiring-itineraries/flemish-coast-67-kilometres-beach-culture-history-and-heritage"
  },
  {
    catalogId: "domburg",
    name: "Domburg — Noordduine",
    lat: 51.554867,
    lon: 3.470338,
    country: "Pays-Bas",
    region: "Zélande",
    travelHours: 4.5,
    swellSector: "nw",
    offshoreSector: "se",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=51.554867%2C3.470338",
    notes: "Spot régulier avec école. Les pieux en bois et les courants imposent de choisir une zone dégagée et de demander conseil localement.",
    sourceLabel: "Zeeland.com",
    sourceUrl: "https://www.zeeland.com/en/visit/islands/walcheren/towns-and-villages/domburg/the-essential-domburg"
  },
  {
    catalogId: "brouwersdam",
    name: "Brouwersdam — côté mer du Nord",
    lat: 51.766667,
    lon: 3.866667,
    country: "Pays-Bas",
    region: "Zélande",
    travelHours: 4.75,
    swellSector: "nw",
    offshoreSector: "se",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=51.766667%2C3.866667",
    notes: "Destination nautique connue. La zone est plutôt abritée des courants, mais ceux-ci augmentent en allant vers Ouddorp et les ouvrages.",
    sourceLabel: "Zeeland.com",
    sourceUrl: "https://www.zeeland.com/nl-nl/visit/wat-te-doen/watersporten/surfen"
  },
  {
    catalogId: "scheveningen",
    name: "Scheveningen — Noorderstrand",
    lat: 52.103583,
    lon: 4.265574,
    country: "Pays-Bas",
    region: "La Haye",
    travelHours: 5,
    swellSector: "nw",
    offshoreSector: "se",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=52.103583%2C4.265574",
    notes: "Surf toute l’année et plusieurs écoles. Ne jamais surfer seul ; éviter les zones de baïnes près des épis et des jetées.",
    sourceLabel: "DenHaag.com",
    sourceUrl: "https://denhaag.com/en/tips-for-you/surfen-in-scheveningen"
  },
  {
    catalogId: "vluchtenburg",
    name: "Vluchtenburg Beach — 's-Gravenzande",
    lat: 52.0029717,
    lon: 4.1267831,
    country: "Pays-Bas",
    region: "Hollande-Méridionale",
    travelHours: 4.5,
    swellSector: "nw",
    offshoreSector: "se",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=52.0029717%2C4.1267831",
    notes: "Repéré dans ta liste Google Maps. Plage ouverte sur la mer du Nord : rester loin des ouvrages et vérifier les courants avant la mise à l’eau.",
    sourceLabel: "Ta liste Google Maps",
    sourceUrl: "https://www.google.com/maps/search/?api=1&query=52.0029717%2C4.1267831",
    personalStarter: true
  },
  {
    catalogId: "le-rozel",
    name: "Le Rozel — plage",
    lat: 49.4878388,
    lon: -1.8436636,
    country: "France",
    region: "Cotentin",
    travelHours: 7,
    sweetMin: 0.7,
    sweetMax: 1.2,
    hardMax: 1.45,
    swellSector: "w",
    offshoreSector: "e",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=49.4878388%2C-1.8436636",
    notes: "Ton repère Google Maps au Rozel. Côte ouest exposée : privilégier une petite houle propre et observer les courants avant d’entrer.",
    sourceLabel: "Cotentin Tourisme",
    sourceUrl: "https://www.cotentin-tourisme-normandie.fr/ete-cotentin-plages/",
    personalStarter: true
  },
  {
    catalogId: "siouville",
    name: "Siouville-Hague — plage",
    lat: 49.5709348,
    lon: -1.8431215,
    country: "France",
    region: "Cotentin",
    travelHours: 7,
    sweetMin: 0.7,
    sweetMax: 1.2,
    hardMax: 1.45,
    swellSector: "w",
    offshoreSector: "e",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=49.5709348%2C-1.8431215",
    notes: "Ton repère Google Maps à Siouville. Côte ouest exposée à l’Atlantique, rouleaux réguliers et école de surf. La houle peut être plus puissante que dans le Nord.",
    sourceLabel: "Cotentin Tourisme",
    sourceUrl: "https://www.cotentin-tourisme-normandie.fr/ete-cotentin-plages/",
    personalStarter: true
  },
  {
    catalogId: "sciotot",
    name: "Sciotot — plage",
    lat: 49.5051244,
    lon: -1.8514162,
    country: "France",
    region: "Cotentin",
    travelHours: 7,
    sweetMin: 0.7,
    sweetMax: 1.2,
    hardMax: 1.45,
    swellSector: "w",
    offshoreSector: "e",
    googleMapsUrl: "https://www.google.com/maps/search/?api=1&query=49.5051244%2C-1.8514162",
    notes: "Ton repère Google Maps aux Pieux, sur la plage de Sciotot. Vérifier la marée, les courants et la puissance réelle avant de se mettre à l’eau.",
    sourceLabel: "Cotentin Tourisme",
    sourceUrl: "https://www.cotentin-tourisme-normandie.fr/circuits/circuit-decouverte-de-la-hague-en-normandie/",
    personalStarter: true
  }
].map((spot) => ({ ...COMMON_BEGINNER, ...spot }));

export const PERSONAL_STARTER_CATALOG_IDS = SPOT_CATALOG
  .filter((spot) => spot.personalStarter)
  .map((spot) => spot.catalogId);

export function catalogSpot(catalogId, createId = () => crypto.randomUUID()) {
  const source = SPOT_CATALOG.find((spot) => spot.catalogId === catalogId);
  if (!source) return null;
  return { ...source, id: createId() };
}

export function personalStarterSpots(createId = () => crypto.randomUUID()) {
  return PERSONAL_STARTER_CATALOG_IDS.map((catalogId) => catalogSpot(catalogId, createId));
}

export function googleMapsDirectionsUrl(spot) {
  const lat = Number(spot?.lat);
  const lon = Number(spot?.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return "";
  const parameters = new URLSearchParams({
    api: "1",
    destination: `${lat},${lon}`,
    travelmode: "driving"
  });
  return `https://www.google.com/maps/dir/?${parameters}`;
}
