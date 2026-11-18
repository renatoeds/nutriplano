import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...CORS, "Content-Type": "application/json" } });

async function isAllowed(auth: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) return false;
  const r = await fetch(`${url}/rest/v1/rpc/is_allowed`, { method: "POST", headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" }, body: "{}" });
  if (!r.ok) return false;
  return (await r.json()) === true;
}

async function openai(messages: unknown[], jsonMode: boolean, maxTokens = 900) {
  const key = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, temperature: 0.2, max_tokens: maxTokens, ...(jsonMode ? { response_format: { type: "json_object" } } : {}) }),
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d?.error?.message || `OpenAI ${r.status}`);
  return d.choices?.[0]?.message?.content ?? "";
}

// Pesquisa na web (Responses API + ferramenta de busca); devolve texto e fontes citadas
async function webSearch(prompt: string) {
  const key = Deno.env.get("OPENAI_API_KEY");
  const model = Deno.env.get("OPENAI_SEARCH_MODEL") || Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
  let last = "";
  for (const tool of ["web_search", "web_search_preview"]) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, input: prompt, tools: [{ type: tool }] }),
    });
    const d = await r.json();
    if (!r.ok) { last = d?.error?.message || `OpenAI ${r.status}`; continue; }
    let text = ""; const sources: { title: string; url: string }[] = []; const seen = new Set<string>();
    for (const item of d.output || []) {
      if (item.type !== "message") continue;
      for (const c of item.content || []) {
        if (c.type === "output_text") {
          text += c.text || "";
          for (const a of c.annotations || []) {
            if (a.type === "url_citation" && a.url && !seen.has(a.url)) { seen.add(a.url); sources.push({ title: a.title || a.url, url: a.url }); }
          }
        }
      }
    }
    return { text: text || d.output_text || "", sources };
  }
  throw new Error(last || "web_search_failed");
}

const SYS = "Você é um nutricionista brasileiro. Use a Tabela TACO (UNICAMP) ou TBCA (USP) como referência quando existir; caso contrário, valores típicos de rótulos brasileiros. Responda sempre em português do Brasil.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const auth = req.headers.get("Authorization") || "";
  if (!(await isAllowed(auth))) return json({ error: "forbidden" }, 403);
  let body: any = {};
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const configured = !!Deno.env.get("OPENAI_API_KEY");
  if (body.action === "ping") return json({ configured });
  if (!configured) return json({ error: "not_configured" }, 503);
  try {
    if (body.action === "food") {
      const q = String(body.text || "").slice(0, 300);
      const out = await openai([
        { role: "system", content: SYS },
        { role: "user", content: `Estime a composição nutricional POR 100 g (ou 100 ml) do alimento: "${q}". Responda só JSON: {"nome":string,"kcal":number,"proteina":number,"carboidrato":number,"gordura":number,"fibra":number,"porcao_nome":string,"porcao_g":number}` },
      ], true, 300);
      return json(JSON.parse(out));
    }
    if (body.action === "photo") {
      const img = String(body.image || "");
      if (!img.startsWith("data:image/") || img.length > 4_000_000) return json({ error: "bad_image" }, 400);
      const out = await openai([
        { role: "system", content: SYS },
        { role: "user", content: [
          { type: "text", text: `Identifique os alimentos desta refeição e estime a quantidade de cada um em gramas (porções brasileiras típicas). ${body.hint ? "Observação do usuário: " + String(body.hint).slice(0, 200) + ". " : ""}Para cada item, dê os valores PARA A QUANTIDADE ESTIMADA. Responda só JSON: {"itens":[{"nome":string,"gramas":number,"kcal":number,"proteina":number,"carboidrato":number,"gordura":number,"fibra":number}],"observacao":string}` },
          { type: "image_url", image_url: { url: img, detail: "low" } },
        ] },
      ], true, 900);
      return json(JSON.parse(out));
    }
    if (body.action === "report") {
      const data = JSON.stringify(body.data || {}).slice(0, 12000);
      const out = await openai([
        { role: "system", content: SYS + " Você também entende de treino de força e cardio. Seja direto, prático e encorajador, sem exageros. Não dê diagnósticos médicos." },
        { role: "user", content: `Escreva um relatório semanal curto (até ~250 palavras, com subtítulos simples e listas) analisando estes dados de dieta, peso e treino. Diga o que funcionou, onde a proteína/calorias ficaram fora da meta, como estão o peso (tendência) e os treinos, e dê 3 sugestões concretas para a próxima semana. Dados: ${data}` },
      ], false, 900);
      return json({ text: out });
    }
    if (body.action === "verify") {
      const product = String(body.product || "").slice(0, 120);
      const brand = String(body.brand || "").slice(0, 80);
      if (!product && !brand) return json({ error: "missing" }, 400);
      const prompt = `Pesquise na internet informações públicas e recentes sobre o suplemento alimentar "${product}"${brand ? ` da marca "${brand}"` : ""}, vendido no Brasil.
Responda em português do Brasil, em até ~200 palavras, com estes subtítulos curtos:
## Regularização — o que se sabe sobre notificação/registro na Anvisa e se houve proibição, apreensão ou recolhimento (cite número de resolução e data quando houver).
## Laudos e testes — resultados de análises de laboratório divulgados (quem fez, quando, resultado) e se foram contestados.
## Reclamações — padrão de reclamações de consumidores, se houver.
## Em resumo — 2 ou 3 frases neutras do que conferir. NÃO dê nota nem diga que o produto é bom ou ruim; diga quando não encontrar informação.
Use apenas fontes que você encontrar e cite-as. Se houver informações de marcas ou produtos parecidos, deixe claro que não são do mesmo produto.`;
      const r = await webSearch(prompt);
      return json(r);
    }
    return json({ error: "unknown_action" }, 400);
  } catch (e) {
    return json({ error: "ai_failed", message: String((e as Error).message || e) }, 502);
  }
});
