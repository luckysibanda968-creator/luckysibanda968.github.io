const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT) || 4173;
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".geojson": "application/geo+json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

http.createServer((request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  } catch {
    response.writeHead(400).end("Bad request");
    return;
  }
  const file = path.resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
  if (!file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  fs.stat(file, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Type": contentTypes[path.extname(file)] || "application/octet-stream",
    });
    fs.createReadStream(file).pipe(response);
  });
}).listen(port, "127.0.0.1", () => {
  console.log(`Bulawayo map preview: http://127.0.0.1:${port}/`);
});
