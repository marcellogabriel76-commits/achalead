// Função serverless da Vercel: GET /api/search?niche=chaveiro&city=Manaus&limit=30&radius=8&mode=nosite
// Fontes: OpenStreetMap (Nominatim para achar a cidade, Overpass para listar estabelecimentos).
// Gratuito e sem chave de API. Cobertura varia por cidade.

const UA = "LeadFinderBR/1.0 (ferramenta de prospeccao)";
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

// Nicho (texto digitado) -> tags do OpenStreetMap
const NICHES = {
  restaurante: ["amenity=restaurant"],
  lanchonete: ["amenity=fast_food"],
  bar: ["amenity=bar", "amenity=pub"],
  cafeteria: ["amenity=cafe"],
  padaria: ["shop=bakery"],
  mercado: ["shop=supermarket", "shop=convenience"],
  acougue: ["shop=butcher"],
  hortifruti: ["shop=greengrocer"],
  farmacia: ["amenity=pharmacy"],
  dentista: ["amenity=dentist"],
  clinica: ["amenity=clinic", "amenity=doctors"],
  veterinario: ["amenity=veterinary"],
  "pet shop": ["shop=pet"],
  salao: ["shop=hairdresser", "shop=beauty"],
  barbearia: ["shop=hairdresser"],
  estetica: ["shop=beauty"],
  academia: ["leisure=fitness_centre"],
  oficina: ["shop=car_repair"],
  "auto pecas": ["shop=car_parts"],
  "lava jato": ["amenity=car_wash"],
  borracharia: ["shop=tyres"],
  chaveiro: ["shop=locksmith", "craft=locksmith"],
  "loja de roupas": ["shop=clothes", "shop=boutique"],
  calcados: ["shop=shoes"],
  otica: ["shop=optician"],
  joalheria: ["shop=jewelry"],
  papelaria: ["shop=stationery"],
  livraria: ["shop=books"],
  floricultura: ["shop=florist"],
  "material de construcao": ["shop=doityourself", "shop=hardware"],
  moveis: ["shop=furniture"],
  eletronicos: ["shop=electronics"],
  celular: ["shop=mobile_phone"],
  informatica: ["shop=computer"],
  lavanderia: ["shop=laundry"],
  hotel: ["tourism=hotel", "tourism=guest_house"],
  pousada: ["tourism=guest_house", "tourism=hostel"],
  escola: ["amenity=school", "amenity=language_school"],
  contabilidade: ["office=accountant"],
  advogado: ["office=lawyer"],
  imobiliaria: ["office=estate_agent"],
  fotografo: ["craft=photographer", "shop=photo"],
  gráfica: ["craft=printer", "shop=copyshop"],
  grafica: ["craft=printer", "shop=copyshop"],
  eletricista: ["craft=electrician"],
  marcenaria: ["craft=carpenter"],
  serralheria: ["craft=metal_construction"],
  costureira: ["craft=tailor", "shop=tailor"],
};

const SOCIAL = /(facebook|instagram|fb\.com|linktr\.ee|wa\.me|whatsapp|tiktok|twitter|x\.com|youtube)/i;

const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const esc = (s) => String(s).replace(/[\\"]/g, "\\$&");

async function geocode(city) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=" +
    encodeURIComponent(city);
  const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "pt-BR" } });
  if (!r.ok) throw new Error("Não consegui localizar a cidade.");
  const j = await r.json();
  if (!j.length) return null;
  return { lat: +j[0].lat, lon: +j[0].lon, label: j[0].display_name };
}

function buildQuery(niche, lat, lon, radius) {
  const key = norm(niche);
  const around = `(around:${radius},${lat},${lon})`;
  let parts = [];
  const match = Object.keys(NICHES).find((k) => norm(k) === key) ||
    Object.keys(NICHES).find((k) => key && (norm(k).includes(key) || key.includes(norm(k))));
  if (match) {
    for (const tag of NICHES[match]) {
      const [k, v] = tag.split("=");
      parts.push(`nwr["${k}"="${v}"]${around};`);
    }
  } else {
    // Nicho livre: procura pelo nome em lojas, serviços e escritórios
    const re = esc(niche);
    for (const k of ["shop", "amenity", "office", "craft", "leisure", "tourism"]) {
      parts.push(`nwr["name"~"${re}",i]["${k}"]${around};`);
    }
  }
  return `[out:json][timeout:25];(${parts.join("")});out center tags 500;`;
}

async function overpass(query) {
  let lastErr;
  for (const base of OVERPASS) {
    try {
      const r = await fetch(base, {
        method: "POST",
        headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(query),
      });
      if (!r.ok) throw new Error("Overpass " + r.status);
      return await r.json();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("Fonte de dados indisponível.");
}

function toLead(el) {
  const t = el.tags || {};
  const name = t.name || t.brand || "";
  if (!name) return null;

  const rawSite = t.website || t["contact:website"] || t.url || "";
  const fb = t["contact:facebook"] || t.facebook || "";
  const ig = t["contact:instagram"] || t.instagram || "";
  const siteIsSocial = rawSite && SOCIAL.test(rawSite);
  const hasSite = !!rawSite && !siteIsSocial;

  const phone = t.phone || t["contact:phone"] || t["contact:mobile"] || t.mobile || "";
  const whatsapp = t["contact:whatsapp"] || t.whatsapp || "";

  const addr = [
    [t["addr:street"], t["addr:housenumber"]].filter(Boolean).join(", "),
    t["addr:suburb"] || t["addr:neighbourhood"],
    t["addr:city"],
  ]
    .filter(Boolean)
    .join(" · ");

  const category =
    t.shop || t.amenity || t.craft || t.office || t.leisure || t.tourism || "";

  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;

  return {
    id: `${el.type}${el.id}`,
    name,
    category,
    address: addr,
    phone: phone.split(";")[0].trim(),
    whatsapp: whatsapp.split(";")[0].trim(),
    hours: t.opening_hours || "",
    email: t.email || t["contact:email"] || "",
    website: hasSite ? rawSite : "",
    social: [rawSite && siteIsSocial ? rawSite : "", fb, ig].filter(Boolean),
    hasSite,
    lat,
    lon,
  };
}

export default async function handler(req, res) {
  try {
    const niche = String(req.query.niche || "").trim();
    const city = String(req.query.city || "").trim();
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 200);
    const radiusKm = Math.min(Math.max(parseFloat(req.query.radius) || 8, 1), 30);
    const mode = req.query.mode === "all" ? "all" : "nosite";

    if (niche.length < 2 || city.length < 2) {
      return res.status(400).json({ error: "Informe o nicho e a cidade." });
    }

    const place = await geocode(city);
    if (!place) {
      return res.status(404).json({ error: `Não encontrei a cidade "${city}".` });
    }

    const data = await overpass(buildQuery(niche, place.lat, place.lon, radiusKm * 1000));

    const seen = new Set();
    let leads = (data.elements || [])
      .map(toLead)
      .filter(Boolean)
      .filter((l) => {
        const k = norm(l.name) + "|" + norm(l.address);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });

    const total = leads.length;
    const withoutSite = leads.filter((l) => !l.hasSite).length;
    if (mode === "nosite") leads = leads.filter((l) => !l.hasSite);

    // Quem tem contato vem primeiro: é quem dá para abordar
    leads.sort((a, b) => {
      const sa = (a.phone || a.whatsapp ? 2 : 0) + (a.social.length ? 1 : 0);
      const sb = (b.phone || b.whatsapp ? 2 : 0) + (b.social.length ? 1 : 0);
      return sb - sa;
    });

    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).json({
      place: place.label,
      total,
      withoutSite,
      leads: leads.slice(0, limit),
    });
  } catch (e) {
    return res.status(502).json({
      error: "A fonte de dados não respondeu agora. Tente de novo em instantes.",
    });
  }
}
