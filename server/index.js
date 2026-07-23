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
