import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configuradas na Vercel." });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const { data, error } = await supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(20);
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(data);
  }

  res.status(405).json({ error: "Método não permitido." });
}
