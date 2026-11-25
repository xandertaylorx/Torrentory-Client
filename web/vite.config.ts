import { defineConfig, type Connect, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

// /chat and /messenger serve the messenger app (messenger.html); vercel.json does the same in production.
const MESSENGER_PATHS = /^\/(chat|messenger|chat\/test)\/?(\?.*)?$/;
const rewrite: Connect.NextHandleFunction = (req, _res, next) => {
  if (req.url && MESSENGER_PATHS.test(req.url)) req.url = "/messenger.html";
  next();
};
const messengerRoutes: Plugin = {
  name: "messenger-routes",
  configureServer(server) { server.middlewares.use(rewrite); },
  configurePreviewServer(server) { server.middlewares.use(rewrite); },
};

export default defineConfig({
  base: "/",
  plugins: [messengerRoutes, react(), tailwindcss()],
  build: {
    target: "es2022",
    rollupOptions: { input: { main: resolve(__dirname, "index.html"), messenger: resolve(__dirname, "messenger.html") } },
  },
});
