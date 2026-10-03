// Reads a receipt photo with Gemini (free tier) and returns structured items.
// Secrets: GEMINI_API_KEY (required), GEMINI_MODEL (optional), ALLOWED_EMAILS (optional, comma-separated).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

const CATEGORIES = {
  food: "食費（スーパー・コンビニの食料品・飲み物）",
  dining: "外食・カフェ（飲食店・カフェ・テイクアウト）",
  daily: "日用品（洗剤・ティッシュ・消耗品）",
  clothes: "衣類・美容（服・靴・化粧品・美容院）",
  sports: "スポーツ・健康（ジム・ウェア・シューズ・サプリ・プロテイン・大会参加費）",
  transport: "交通（電車・バス・タクシー・ガソリン・駐車場）",
  hobby: "娯楽・趣味（ゲーム・映画・旅行・ホテル）",
  medical: "医療（病院・処方薬・市販薬）",
  home: "住居・光熱・通信（家賃・電気・ガス・水道・スマホ）",
  social: "交際費（飲み会・プレゼント・ご祝儀）",
  education: "教育・書籍（本・講座・文房具）",
  misc: "雑費（上のどれにも当てはまらないもの）",
};

const SCHEMA = {
  type: "OBJECT",
  properties: {
    is_receipt: { type: "BOOLEAN" },
    store: { type: "STRING" },
    date: { type: "STRING", description: "YYYY-MM-DD。読めなければ空文字" },
    total: { type: "INTEGER", description: "実際に支払った合計金額（税込・円）" },
    items: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          name: { type: "STRING" },
          amount: { type: "INTEGER", description: "税込・値引き後の金額（円）" },
          category: { type: "STRING", enum: Object.keys(CATEGORIES) },
        },
        required: ["name", "amount", "category"],
      },
    },
  },
  required: ["is_receipt", "store", "date", "total", "items"],
};

function prompt(today: string) {
  return `あなたは日本のレシート・領収書を正確に読み取る担当です。画像のレシートを読み、指定のJSONで返してください。

カテゴリ（category には左側のIDを入れる）:
${Object.entries(CATEGORIES).map(([k, v]) => `- ${k}: ${v}`).join("\n")}

ルール:
- 数字は1桁ずつ慎重に読む。¥や円の記号、カンマ、「*」「※」「軽」などの記号は金額に含めない。
- 小計・合計・消費税の行・お預り・お釣り・ポイント・支払方法の行は items に入れない。
- 「2個 × 158」のような数量行は、その品目の金額（316）として1行にまとめる。
- 外税表示なら、消費税を各品目に按分して税込金額にする（8%と10%が混在する場合はそれぞれの税率で）。
- 値引き・割引は対象の品目から差し引く。対象が分からない値引きは name「値引き」、負の amount で1行にする。
- items の amount の合計が total と一致するようにする。
- 品名は短く分かりやすく（略語は読める範囲で正式名に）。
- 同じレシートでも品目ごとにカテゴリを分ける（食材は food、洗剤は daily など）。飲食店のレシートは dining。
- 年が省略・2桁・和暦の場合は西暦に直す。今日は ${today}。日付が読めなければ空文字。
- レシートではない画像なら is_receipt を false にし、items は空にする。`;
}

const MODELS = (Deno.env.get("GEMINI_MODEL") || "gemini-flash-latest,gemini-2.5-flash,gemini-flash-lite-latest,gemini-2.5-flash-lite")
  .split(",").map((s) => s.trim()).filter(Boolean);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // who is calling (verify_jwt already rejected anonymous requests)
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);
  const allowed = (Deno.env.get("ALLOWED_EMAILS") || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (allowed.length && !allowed.includes((user.email || "").toLowerCase())) return json({ error: "forbidden" }, 403);

  const key = Deno.env.get("GEMINI_API_KEY");
  if (!key) return json({ error: "no_key" }, 503);

  let body: { image?: string; mime?: string; today?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const image = body.image || "";
  if (!image || image.length > 8_000_000) return json({ error: "bad_image" }, 400);
  const today = /^\d{4}-\d{2}-\d{2}$/.test(body.today || "") ? body.today! : new Date().toISOString().slice(0, 10);

  const payload = {
    contents: [{ role: "user", parts: [{ inline_data: { mime_type: body.mime || "image/jpeg", data: image } }, { text: prompt(today) }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SCHEMA },
  };

  let lastStatus = 0, lastDetail = "";
  for (const model of MODELS) {
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify(payload),
    });
    if (r.ok) {
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || "").join("") || "";
      try { return json({ model, result: JSON.parse(text) }); }
      catch { lastStatus = 502; lastDetail = "unparseable"; continue; }
    }
    lastStatus = r.status; lastDetail = (await r.text()).slice(0, 300);
    if (r.status === 400 || r.status === 401 || r.status === 403) break; // bad key or request: other models won't help
    // 404 (model name gone), 429 (quota), 5xx: try the next model
  }
  const keyProblem = lastStatus === 401 || lastStatus === 403 || /API key|API_KEY/i.test(lastDetail);
  const error = lastStatus === 429 ? "quota" : keyProblem ? "bad_key" : lastStatus === 400 ? "bad_request" : "upstream";
  return json({ error, status: lastStatus, detail: lastDetail }, error === "quota" ? 429 : 502);
});
