import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function formatPrice(cents) {
  return "R$ " + (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 0 });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("kits")
      .select("*")
      .order("price_cents", { ascending: true });
    if (error) return res.status(500).json({ error: error.message });

    // Formata preço para o frontend
    const kits = data.map((k) => ({
      ...k,
      price: formatPrice(k.price_cents),
      stock: `${k.stock} unidades`,
    }));
    return res.status(200).json(kits);
  }

  res.status(405).json({ error: "Método não permitido." });
}
