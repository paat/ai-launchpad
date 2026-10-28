import { createApp, configFromEnv } from "./app.js";
const cfg = configFromEnv();
const { app } = createApp(cfg);
const port = Number(process.env.PORT ?? 3000);
app.listen(port, "127.0.0.1", () => console.log(`AI Launchpad listening on http://localhost:${port} (demo=${cfg.demo}, model=${cfg.modelMode})`));
