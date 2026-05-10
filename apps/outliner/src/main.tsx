import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Outliner } from "./Outliner.js";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Outliner />
  </StrictMode>,
);
