import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ToastContainer } from "react-toastify";
import "./index.css";
import "./app-common.css";
import App from "./App";
import "react-toastify/dist/ReactToastify.css";
import { applyTextSize, loadTextSize } from "./textSize";

applyTextSize(loadTextSize());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <ToastContainer
      position="top-right"
      autoClose={2500}
      hideProgressBar={false}
      newestOnTop
      closeOnClick
      pauseOnHover
      theme="light"
    />
  </StrictMode>
);
