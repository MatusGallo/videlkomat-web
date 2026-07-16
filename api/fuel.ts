import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createHash } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PASSWORD_HASH = process.env.APP_PASSWORD_HASH;

const sb = (path: string, init?: RequestInit) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY as string,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

const authed = (req: VercelRequest): boolean => {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return false;
  const hash = createHash("sha256").update(token).digest("hex");
  return hash === PASSWORD_HASH;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!SUPABASE_URL || !SERVICE_KEY || !PASSWORD_HASH) {
    return res.status(500).json({ error: "Server není nakonfigurován" });
  }
  if (!authed(req)) return res.status(401).json({ error: "Neautorizováno" });

  try {
    if (req.method === "GET") {
      const r = await sb("fuel?select=id,m,date,amount,liters&order=date.asc");
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      const rows = (await r.json()) as Array<Record<string, unknown>>;
      const data = rows.map((e) => ({
        id: String(e.id),
        m: Number(e.m),
        date: String(e.date),
        amount: Number(e.amount),
        liters: e.liters == null ? null : Number(e.liters),
      }));
      return res.status(200).json(data);
    }

    if (req.method === "POST") {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      if (!body?.id) return res.status(400).json({ error: "Chybí id" });
      const r = await sb("fuel", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify({
          id: String(body.id),
          m: Number(body.m),
          date: String(body.date),
          amount: Number(body.amount),
          liters: body.liters == null || body.liters === "" ? null : Number(body.liters),
        }),
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.status(204).end();
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id ?? "");
      if (!id) return res.status(400).json({ error: "Chybí id" });
      const r = await sb(`fuel?id=eq.${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      if (!r.ok) return res.status(502).json({ error: await r.text() });
      return res.status(204).end();
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Metoda není povolena" });
  } catch (e) {
    return res.status(500).json({ error: String(e) });
  }
}
