import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Configuration
const SUPABASE_URL = process.env.VITE_SUPABASE_URL || "https://vifofmlmrwtnxkgempyg.supabase.co";
const SUPABASE_KEY = process.env.VITE_SUPABASE_ANON_KEY || "sb_publishable_FKeGP_b9K6VR3RJXJyMpVQ_94QCm7ML";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/schedule", async (req, res) => {
    const { data, error } = await supabase
      .from("schedule")
      .select("*")
      .order("time", { ascending: true });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/schedule", async (req, res) => {
    const { day, time, period_number, teacher_prefix, teacher_name, subject, class_name } = req.body;
    const { data, error } = await supabase
      .from("schedule")
      .insert([{ day, time, period_number, teacher_prefix, teacher_name, subject, class_name }])
      .select();
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ id: data[0].id });
  });

  app.put("/api/schedule/:id", async (req, res) => {
    const { day, time, period_number, teacher_prefix, teacher_name, subject, class_name, is_active } = req.body;
    const { error } = await supabase
      .from("schedule")
      .update({ day, time, period_number, teacher_prefix, teacher_name, subject, class_name, is_active })
      .eq("id", req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/schedule/:id", async (req, res) => {
    const { error } = await supabase
      .from("schedule")
      .delete()
      .eq("id", req.params.id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
