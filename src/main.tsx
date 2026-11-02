import { createRoot } from "react-dom/client";
import App from "./App";
import "./style.css";
import { applyScale, loadScale } from "./theme";
applyScale(loadScale());
// In-browser backend answers /api, /ws and media in the page.
const ready = import("./demo/server");
void ready.then(() =>
  createRoot(document.getElementById("root")!).render(<App />),
);
