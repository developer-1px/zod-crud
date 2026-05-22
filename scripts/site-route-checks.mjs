const routePathPattern = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*\/?)*$/;
const validGroups = new Set(["Start", "Demos"]);

export function validateSiteRoutes(routes, fail) {
  if (!Array.isArray(routes) || routes.length === 0) {
    fail("site routes must be a non-empty array.");
    return;
  }

  const paths = new Set();
  const files = new Set();
  const labels = new Set();
  const titles = new Set();
  const descriptions = new Set();

  routes.forEach((route, index) => {
    if (!route || typeof route !== "object") {
      fail(`site route ${index} must be an object.`);
      return;
    }

    if (typeof route.path !== "string" || !routePathPattern.test(route.path)) {
      fail(`site route ${index} has an invalid path.`);
    }
    if (route.path !== "/" && route.path.endsWith("/")) {
      fail(`site route ${route.path} must not have a trailing slash.`);
    }
    if (typeof route.label !== "string" || route.label.trim() === "") {
      fail(`site route ${route.path} is missing a label.`);
    }
    if (typeof route.title !== "string" || route.title.trim() === "") {
      fail(`site route ${route.path} is missing a title.`);
    }
    if (typeof route.description !== "string" || route.description.trim() === "") {
      fail(`site route ${route.path} is missing a description.`);
    }
    if (!validGroups.has(route.group)) {
      fail(`site route ${route.path} has an invalid group.`);
    }

    if (typeof route.path === "string") {
      if (paths.has(route.path)) fail(`site routes contain duplicate path ${route.path}.`);
      paths.add(route.path);

      const file = routeFile(route.path);
      if (files.has(file)) fail(`site routes contain duplicate output file ${file}.`);
      files.add(file);
    }

    if (labels.has(route.label)) fail(`site routes contain duplicate label ${route.label}.`);
    labels.add(route.label);

    if (titles.has(route.title)) fail(`site routes contain duplicate title ${route.title}.`);
    titles.add(route.title);

    if (descriptions.has(route.description)) fail(`site routes contain duplicate description for ${route.path}.`);
    descriptions.add(route.description);
  });

  if (routes[0]?.path !== "/") {
    fail("site routes must start with the overview route.");
  }
}

export function routeFile(path) {
  return path === "/" ? "index.html" : `${path.slice(1)}/index.html`;
}
