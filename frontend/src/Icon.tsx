// Stroke icons drawn inline: font glyphs vary too much between systems.
const paths = {
  calendar: "M5 5h14v16H5zM5 10h14M8 3v4M16 3v4M8 13h2M14 13h2M8 17h2M14 17h2",
  games: "M7 7h10l4 10-3 2-4-4h-4l-4 4-3-2zM6 11h6M9 8v6M16 10h.01M18 13h.01",
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
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .2-1.3-1.3L17 5l-3-1-1 2h-2L10 4 7 5l.3 2L6 8.2 4 8l-1 3 2 1-2 1 1 3 2-.2L7.3 17 7 19l3 1 1-2h2l1 2 3-1-.3-2 1.3-1.2 2 .2 1-3z",
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
