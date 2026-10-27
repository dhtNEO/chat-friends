import { useId } from "react";

// "Entre amigos" is literally the space between friends: two circles and the
// lens where they overlap. The gradient follows each person's colors.
export function Logo({ size = 38 }: { size?: number }) {
  const id = useId();
  return (
    <svg
      className="logo"
      style={{ width: size / 14 + "rem", height: size / 14 + "rem" }}
      viewBox="0 0 48 48"
      role="img"
      aria-label="Entre amigos"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--secondary)" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill={`url(#${id})`} />
      <circle
        cx="19"
        cy="24"
        r="10"
        fill="none"
        stroke="white"
        strokeWidth="3"
        opacity="0.9"
      />
      <circle
        cx="29"
        cy="24"
        r="10"
        fill="none"
        stroke="white"
        strokeWidth="3"
        opacity="0.9"
      />
      <path d="M24 15.3a10 10 0 0 1 0 17.4a10 10 0 0 1 0-17.4z" fill="white" />
    </svg>
  );
}
