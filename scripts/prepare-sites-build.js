const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const dist = path.join(root, "dist");
const serverDir = path.join(dist, "server");
const openaiDir = path.join(dist, ".openai");
const swPath = path.join(dist, "sw.js");

fs.mkdirSync(serverDir, { recursive: true });
fs.mkdirSync(openaiDir, { recursive: true });
fs.copyFileSync(path.join(root, ".openai", "hosting.json"), path.join(openaiDir, "hosting.json"));

if (fs.existsSync(swPath)) {
  const assetsDir = path.join(dist, "assets");
  const precacheAssets = fs.existsSync(assetsDir)
    ? fs.readdirSync(assetsDir).map((file) => `assets/${file}`)
    : [];
  const sw = fs.readFileSync(swPath, "utf8")
    .replace("self.__PRECACHE_ASSETS__ || []", JSON.stringify(precacheAssets));
  fs.writeFileSync(swPath, sw);
}

const worker = `
const assetManifest = self.__STATIC_CONTENT_MANIFEST;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    let pathname = url.pathname;

    if (pathname === "/") {
      pathname = "/index.html";
    }

    const assetRequest = new Request(new URL(pathname, url.origin), request);

    try {
      return await env.ASSETS.fetch(assetRequest);
    } catch (error) {
      if (!pathname.includes(".")) {
        return env.ASSETS.fetch(new Request(new URL("/index.html", url.origin), request));
      }
      return new Response("Not found", { status: 404 });
    }
  }
};
`;

fs.writeFileSync(path.join(serverDir, "index.js"), worker.trimStart());
