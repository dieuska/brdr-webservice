import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import "./projections";
import HeritageLifecycleManagerApp from "./heritage/HeritageLifecycleManagerApp";

function HeritageLifecyclePage() {
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, []);
  return <HeritageLifecycleManagerApp />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><HeritageLifecyclePage /></StrictMode>);
