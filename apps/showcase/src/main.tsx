import { StrictMode, useEffect, useState } from "react";
import { createRoot, type Root } from "react-dom/client";

import { ExampleViewer } from "./ExampleViewer.js";
import { Playground } from "./Playground.js";
import { HeadlessRoute } from "./routes/HeadlessRoute.js";
import "./style.css";

declare global {
  var zodCrudShowcaseRoot: Root | undefined;
}

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return hash;
}

function App() {
  const route = useHashRoute();
  return (
    <>
      <nav className="route-nav">
        <a href="#/">Playground</a>
        <a href="#/headless">Headless wrapper</a>
      </nav>
      {route === "#/headless" ? (
        <HeadlessRoute />
      ) : (
        <>
          <ExampleViewer />
          <Playground />
        </>
      )}
    </>
  );
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing root element.");
}

globalThis.zodCrudShowcaseRoot ??= createRoot(rootElement);
globalThis.zodCrudShowcaseRoot.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
