import { useId } from "react";

// VGH symbol, a house with a controller, drawn from the brand kit's vector
// symbol with three fixes: the chimney meets the roof, the glow's filter area
// no longer clips, and a simplified cut for small sizes (36 px and below). Colors come from
// the --logo-* properties that theme.ts derives from each person's colors.
export function Logo({ size = 38 }: { size?: number }) {
  return (
    <svg
      className="logo"
      style={{ width: size / 14 + "rem", height: size / 14 + "rem" }}
      viewBox="0 0 512 512"
      role="img"
      aria-label="VGH"
    >
      <Symbol small={size <= 36} />
    </svg>
  );
}

function Symbol({ small = false }: { small?: boolean }) {
  const id = useId(),
    roof = `url(#${id}r)`,
    pad = `url(#${id}p)`;
  const defs = (
    <defs>
      <linearGradient id={id + "r"} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="var(--logo-roof-a)" />
        <stop offset=".48" stopColor="var(--logo-roof-b)" />
        <stop offset="1" stopColor="var(--logo-roof-c)" />
      </linearGradient>
      <linearGradient id={id + "p"} x1=".1" y1="0" x2=".9" y2="1">
        <stop stopColor="#fff" />
        <stop offset=".67" stopColor="var(--logo-pad-b)" />
        <stop offset="1" stopColor="var(--logo-pad-c)" />
      </linearGradient>
      <filter id={id + "g"} x="-30%" y="-80%" width="160%" height="260%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
    </defs>
  );
  if (small)
    return (
      <>
        {defs}
        <path
          d="M48 236 L256 70 L464 236"
          fill="none"
          stroke={roof}
          strokeWidth="64"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M140 300 C150 262 178 250 214 260 C242 268 270 268 298 260 C334 250 362 262 372 300 L392 362 C400 392 380 414 352 408 C334 404 318 390 300 372 H212 C194 390 178 404 160 408 C132 414 112 392 120 362 Z"
          fill={pad}
        />
        <g fill="var(--logo-ink)">
          <rect x="168" y="306" width="74" height="24" rx="6" />
          <rect x="193" y="281" width="24" height="74" rx="6" />
        </g>
      </>
    );
  return (
    <>
      {defs}
      <path
        d="M65 224 L256 77 L447 224"
        fill="none"
        stroke="var(--logo-roof-b)"
        strokeWidth="58"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity=".32"
        filter={`url(#${id}g)`}
      />
      <path
        d="M369 164 V100 H410 V195"
        fill="none"
        stroke={roof}
        strokeWidth="32"
        strokeLinejoin="round"
      />
      <path
        d="M65 224 L256 77 L447 224"
        fill="none"
        stroke={roof}
        strokeWidth="35"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M127 236 V367 Q127 406 165 406 H347 Q385 406 385 367 V236"
        fill="none"
        stroke="var(--logo-roof-b)"
        strokeOpacity=".42"
        strokeWidth="20"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M146 290 C156 258 179 247 211 256 C225 261 241 263 256 263 C273 263 292 261 310 256 C345 247 365 263 374 294 L394 350 C402 377 384 397 360 391 C344 388 326 373 307 354 H205 C187 373 169 389 153 391 C129 396 111 376 119 352 Z"
        fill={pad}
        stroke="var(--logo-pad-c)"
        strokeWidth="7"
        strokeLinejoin="round"
      />
      <g fill="var(--logo-ink)">
        <rect x="181" y="302" width="67" height="20" rx="5" />
        <rect x="204" y="279" width="20" height="67" rx="5" />
        <circle cx="310" cy="292" r="11" />
        <circle cx="337" cy="314" r="11" />
        <circle cx="283" cy="315" r="11" />
        <circle cx="310" cy="339" r="11" />
      </g>
    </>
  );
}

// Symbol with the "VGH" letters: light letters edged in the person's color,
// "GAMING" in the secondary. Fonts are self-hosted (public/brand/fonts).
export function Lockup({
  width = 220,
  tagline = true,
}: {
  width?: number;
  tagline?: boolean;
}) {
  const id = useId();
  return (
    <svg
      className="lockup"
      style={{ width: width / 14 + "rem" }}
      viewBox={`0 0 ${tagline ? 700 : 560} ${tagline ? 196 : 160}`}
      role="img"
      aria-label="VGH Virtual Gaming House"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#fff" />
          <stop offset=".62" stopColor="var(--logo-letter)" />
          <stop offset="1" stopColor="var(--logo-pad-c)" />
        </linearGradient>
      </defs>
      <svg
        width="200"
        height={tagline ? 196 : 160}
        viewBox="40 50 432 380"
        aria-hidden="true"
      >
        <Symbol />
      </svg>
      <text
        x="252"
        y="130"
        className="lockup-letters"
        fontSize="128"
        letterSpacing="-2"
        fill={`url(#${id})`}
        stroke="var(--logo-roof-b)"
        strokeWidth="2.5"
        paintOrder="stroke"
        transform="skewX(-8)"
      >
        VGH
      </text>
      {tagline && (
        <text
          x="236"
          y="178"
          className="lockup-tagline"
          fontSize="19"
          letterSpacing="5.2"
          fill="#f2ecff"
        >
          VIRTUAL <tspan fill="var(--logo-accent)">GAMING</tspan> HOUSE
        </text>
      )}
    </svg>
  );
}
