// Small monochrome stroke icon set (24px grid, currentColor). Decorative by default.
const PATHS = {
  info: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-14h.01M11 12h1v5h1",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35",
  sun: "M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm0-15v2m0 16v2M4.22 4.22l1.42 1.42m12.72 12.72 1.42 1.42M2 12h2m16 0h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42",
  moon: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z",
  chat: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10Z",
  refresh: "M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6",
  chevronRight: "m9 18 6-6-6-6",
  plus: "M12 5v14M5 12h14",
  trash: "M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14",
  download: "M12 3v12m0 0-4-4m4 4 4-4M4 21h16",
  alert: "M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 3",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  activity: "M22 12h-4l-3 9L9 3l-3 9H2",
  layers: "m12 2 10 5-10 5L2 7l10-5Zm-10 10 10 5 10-5M2 17l10 5 10-5",
  flask: "M9 3h6M10 3v6L4 20a1 1 0 0 0 .9 1.5h14.2A1 1 0 0 0 20 20l-6-11V3",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5m4-1v5l4 2",
  table: "M3 4h18v16H3zM3 10h18M3 15h18M9 4v16",
  wallet: "M20 7H5a2 2 0 0 1 0-4h13v4m2 0v12H5a2 2 0 0 1-2-2V5m14 9h.01",
  logout: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9",
  check: "M20 6 9 17l-5-5",
  database: "M12 8c4.97 0 9-1.34 9-3s-4.03-3-9-3-9 1.34-9 3 4.03 3 9 3Zm9-3v14c0 1.66-4.03 3-9 3s-9-1.34-9-3V5m18 7c0 1.66-4.03 3-9 3s-9-1.34-9-3",
  send: "m22 2-7 20-4-9-9-4 20-7Z",
  pie: "M21.21 15.89A10 10 0 1 1 8 2.83M22 12A10 10 0 0 0 12 2v10Z",
  trend: "M3 17l6-6 4 4 8-8M14 7h7v7",
} satisfies Record<string, string>;

export type IconName = keyof typeof PATHS;

export function Icon({ name, label, className = "icon" }: { name: IconName; label?: string; className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
