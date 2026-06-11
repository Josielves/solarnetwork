import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY não configuradas na Vercel." });
  }

  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (req.method === "GET") {
    const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
    if (error) {
  console.error("SUPABASE ERROR:", error);
  return res.status(500).json(error);
}
    return res.status(200).json(data);
  }

  if (req.method === "POST") {
  const { name, city, state, power, type, note } = req.body;

  console.log("BODY RECEBIDO:", req.body);

  if (!name || !city || !state || !power)
    return res.status(400).json({ error: "Campos obrigatórios ausentes." });

  const { data, error } = await supabase
    .from("leads")
    .insert([
      {
        name,
        city,
        state: state.toUpperCase(),
        power: Number(power),
        type: type || "Novo cadastro",
        note: note || ""
      }
    ])
    .select()
    .single();

  console.log("DATA:", data);
  console.log("ERROR:", error);

  if (error) return res.status(500).json({ error: error.message });

  return res.status(201).json(data);
}
