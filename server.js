import express from "express";
import fs from "fs";
import path from "path";
import webpush from "web-push";
import cron from "node-cron";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public"))); // sirve el frontend

// ---------- VAPID (se generan si no existen) ----------
const vapidFile = path.join(__dirname, "vapid.json");
let vapid;
if (fs.existsSync(vapidFile)) {
  vapid = JSON.parse(fs.readFileSync(vapidFile, "utf8"));
} else {
  vapid = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidFile, JSON.stringify(vapid, null, 2));
}
webpush.setVapidDetails(
  "mailto:brayanbn1766@gmail.com", // 👈 Reemplaza por tu email real
  vapid.publicKey,
  vapid.privateKey
);

// ---------- Archivos de datos ----------
const subsFile  = path.join(__dirname, "subscriptions.json");
const tasksFile = path.join(__dirname, "tasks.json");
const readJson  = (f, def) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : def);
const writeJson = (f, data) => fs.writeFileSync(f, JSON.stringify(data, null, 2));

// ---------- API ----------
app.get("/health", (_req, res) => {  // ✅ Healthcheck
  res.status(200).send("ok");
});

app.get("/vapidPublicKey", (_req, res) => res.send(vapid.publicKey));

app.post("/subscribe", (req, res) => {
  const subs = readJson(subsFile, []);
  const sub  = req.body;
  if (sub && sub.endpoint && !subs.find(s => s.endpoint === sub.endpoint)) {
    subs.push(sub);
    writeJson(subsFile, subs);
  }
  res.sendStatus(201);
});

app.get("/tasks", (_req, res) => {
  res.json(readJson(tasksFile, []));
});

app.post("/tasks", (req, res) => {
  const tasks = Array.isArray(req.body) ? req.body : [];
  writeJson(tasksFile, tasks);
  res.sendStatus(200);
});

// ---------- Utilidades ----------
const dayStart = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };

// ---------- CRON: cada minuto revisa y envía push ----------
/*
  Revisa todas las tareas no "done" y:
  - 2 días antes (a nivel fecha)
  - 1 día antes (a nivel fecha)
  - 5 minutos antes (a nivel minutos, tolerancia 4–5 por redondeos)
*/
cron.schedule("* * * * *", async () => {
  const tasks = readJson(tasksFile, []);
  const subs  = readJson(subsFile, []);
  if (!subs.length || !tasks.length) return;

  const now    = new Date();
  const today  = dayStart(now);

  let changed = false;

  for (const t of tasks) {
    if (!t?.due || t?.status === "done") continue;

    const dueDate = new Date(t.due);
    const dueDay  = dayStart(dueDate);

    const diffDays    = Math.round((dueDay - today) / 86400000);
    const diffMinutes = Math.round((dueDate - now) / 60000);

    t.notified = t.notified || { d2: false, d1: false, m5: false };

    let payload = null;

    if (diffDays === 2 && !t.notified.d2) {
      payload = { title: "Tarea próxima (2 días)", body: `${t.title} • ${new Date(t.due).toLocaleString()}` };
      t.notified.d2 = true;
      changed = true;
    }

    if (!payload && diffDays === 1 && !t.notified.d1) {
      payload = { title: "Mañana vence (1 día)", body: `${t.title} • ${new Date(t.due).toLocaleString()}` };
      t.notified.d1 = true;
      changed = true;
    }

    // Tolerancia 4–5 minutos por redondeos/latencias
    if (!payload && diffMinutes <= 5 && diffMinutes >= 4 && !t.notified.m5) {
      payload = { title: "⚡ En 5 minutos", body: `${t.title} vence a las ${new Date(t.due).toLocaleTimeString()}` };
      t.notified.m5 = true;
      changed = true;
    }

    if (payload) {
      const data = JSON.stringify(payload);
      for (const s of subs) {
        try {
          await webpush.sendNotification(s, data);
        } catch (e) {
          // Limpia suscripciones inválidas (410 Gone / 404 Not Found)
          if (e.statusCode === 410 || e.statusCode === 404) {
            const left = readJson(subsFile, []).filter(x => x.endpoint !== s.endpoint);
            writeJson(subsFile, left);
          }
        }
      }
    }
  }

  if (changed) writeJson(tasksFile, tasks);
}, { timezone: "America/Monterrey" }); // ✅ Zona horaria correcta

const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Server on http://localhost:" + port));
