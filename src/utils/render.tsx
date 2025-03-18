import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");
const root = createRoot(container as HTMLElement);

export function render(component: React.ReactNode): void {
	root.render(<StrictMode>{component}</StrictMode>);
}
