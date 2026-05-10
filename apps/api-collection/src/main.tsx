import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ApiCollection } from "./ApiCollection.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ApiCollection />
  </StrictMode>,
);
