// Stroke icons drawn inline: font glyphs vary too much between systems.
const paths = {
  chat: "M4 5h16v11H9l-5 4z",
  split: "M4 5h16v14H4zM12 5v14",
  hash: "M5 9h15M4 15h15M10 4 8 20M16 4l-2 16",
  speaker: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  micOff:
    "M9 9v3a3 3 0 0 0 5 2.2M15 10V6a3 3 0 0 0-5.7-1.3M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18",
  headphones: "M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v6H4zM17 15h3v6h-3z",
  headphonesOff:
    "M4 15v-3a8 8 0 0 1 13.7-5.6M20 12v3M4 15h3v6H4zM17 15h3v6h-3zM3 3l18 18",
  screen: "M3 4h18v12H3zM8 20h8M12 16v4",
  share: "M3 4h18v12H3zM8 20h8M12 16v4M12 13V7M9 10l3-3 3 3",
  phone: "M3 13c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0V14l-3 1.5z",
  people:
    "M9 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM3 20a6 6 0 0 1 12 0M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 6",
  reset: "M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4",
  // Lucide "settings" (ISC license).
  settings:
    "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z",
  logout: "M10 4H5v16h5M15 8l4 4-4 4M19 12H9",
  chevron: "M6 9l6 6 6-6",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  collapse: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  fullscreen: "M3 8V3h5M21 8V3h-5M3 16v5h5M21 16v5h-5M8 8h8v8H8z",
  smile:
    "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14a4 4 0 0 0 7 0M9 9.5h.01M15 9.5h.01",
  send: "M4 12l16-8-6 16-2.5-6.5z",
  menu: "M4 6h16M4 12h16M4 18h16",
  close: "M6 6l12 12M18 6 6 18",
  keyboard: "M3 6h18v12H3zM7 10h.01M11 10h.01M15 10h.01M7 14h10",
  palette:
    "M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.6 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4-4-7.5-9-7.5zM7.5 11.5h.01M10 7.5h.01M14.5 7.5h.01M17 11h.01",
  music:
    "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0zM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0z",
  popout: "M14 4h6v6M20 4l-8 8M18 14v6H4V6h6",
  volume: "M4 9h4l5-4v14l-5-4H4zM16 9a4 4 0 0 1 0 6",
  volumeOff: "M4 9h4l5-4v14l-5-4H4zM16 9l5 6M21 9l-5 6",
};
export type IconName = keyof typeof paths;
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 24 24"
      // rem keeps icons in step with the interface size (theme.ts).
      style={{ width: size / 14 + "rem", height: size / 14 + "rem" }}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
