import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { Playground } from "./Playground.js";
import "./style.css";

declare global {
  var zodCrudShowcaseRoot: Root | undefined;
}

const rootElement = document.getElementById("root");

if (rootElement === null) {
  throw new Error("Missing root element.");
}

globalThis.zodCrudShowcaseRoot ??= createRoot(rootElement);
globalThis.zodCrudShowcaseRoot.render(
  <StrictMode>
    <Playground />
  </StrictMode>,
);
