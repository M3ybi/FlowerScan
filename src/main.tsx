import { StorageNotice } from "./components/StorageNotice";
import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "./app/AppErrorBoundary";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <StorageNotice />
    <AppErrorBoundary><App /></AppErrorBoundary>
  </React.StrictMode>,
);
