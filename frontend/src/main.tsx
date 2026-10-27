import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { applyScale, loadScale } from "./theme";
applyScale(loadScale());
// Demo mode answers /api and /ws in the page; production never loads it.
const ready =
  import.meta.env.MODE === "demo" ? import("./demo/server") : Promise.resolve();
void ready.then(() =>
  createRoot(document.getElementById("root")!).render(<App />),
);
