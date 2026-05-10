import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Outliner } from "./Outliner.js";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Outliner />
  </StrictMode>,
);
