import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/fragment-mono/400.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/controls.css";
import "./styles/make.css";
import "./styles/make-cells.css";
import "./styles/zoo.css";
import "./styles/small-screens.css";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { track } from "./analytics.ts";
import { Make } from "./make/page.tsx";
import { hasSavedPaste } from "./make/saved-input.ts";
import { Zoo } from "./zoo/page.tsx";

const returningVisitor = hasSavedPaste();

const showingZoo = () => new URLSearchParams(location.hash.slice(1)).has("view");

function App() {
  const [zoo, setZoo] = useState(showingZoo);
  useEffect(() => {
    const onHashChange = () => setZoo(showingZoo());
    addEventListener("hashchange", onHashChange);
    return () => removeEventListener("hashchange", onHashChange);
  }, []);
  useEffect(() => {
    track("$pageview", { view: zoo ? "zoo" : "make", returning: returningVisitor });
    scrollTo(0, 0);
  }, [zoo]);
  return zoo ? <Zoo /> : <Make />;
}

const root = document.getElementById("app");
if (root) render(<App />, root);
