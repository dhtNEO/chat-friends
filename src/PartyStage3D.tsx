import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

type Props = {
  variant: "dealer" | "guitar";
  active: boolean;
  serverNow: number;
  startsAt?: number;
  adjust?: number;
  notes?: { at: number; lane: number }[];
  judged?: number[];
  flash?: number;
};
const COLORS = [0xe7a2df, 0x94cdec, 0xb1e29c, 0xf5cd8d];

// Original procedural characters: no external model, texture or animation downloads.
export default function PartyStage3D(props: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    latest.current = props;
  }, [props]);
  useEffect(() => {
    const host = mount.current;
    if (!host) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setUnavailable(true);
      return;
    }
    const guitar = props.variant === "guitar";
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(guitar ? 0x0b1025 : 0x10291e, 22, 55);
    const camera = new THREE.PerspectiveCamera(guitar ? 48 : 38, 1, 0.1, 70);
    camera.position.set(0, guitar ? 6.8 : 2.8, guitar ? 14 : 7);
    camera.lookAt(0, guitar ? 1 : 1.8, guitar ? -5 : 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    host.appendChild(renderer.domElement);
    scene.add(new THREE.HemisphereLight(0xd9e9ff, 0x12152f, 2.4));
    const key = new THREE.DirectionalLight(0xffdca9, 4);
    key.position.set(-4, 8, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xa486ff, 4);
    rim.position.set(4, 5, -6);
    scene.add(rim);
    const material = (color: number, metalness = 0.25, glow = false) =>
      new THREE.MeshStandardMaterial({
        color,
        metalness,
        roughness: 0.4,
        emissive: glow ? color : 0,
        emissiveIntensity: glow ? 0.65 : 0,
      });
    const ink = material(0x121d31),
      white = material(0xe5edf2, 0.5),
      gold = material(0xd4a54e, 0.8);
    const accent = material(guitar ? 0xc06bff : 0x36dfd1, 0.5, true);
    const fur = material(guitar ? 0xe88736 : 0xb1c1cb, 0.65);
    const mesh = (
      geometry: THREE.BufferGeometry,
      mat: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const part = new THREE.Mesh(geometry, mat);
      part.position.set(x, y, z);
      parent.add(part);
      return part;
    };
    const box = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => mesh(new THREE.BoxGeometry(w, h, d), mat, parent, x, y, z);
    const ball = (
      r: number,
      mat: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => mesh(new THREE.SphereGeometry(r, 16, 12), mat, parent, x, y, z);
    const ring = (
      r: number,
      mat: THREE.Material,
      parent: THREE.Object3D,
      x = 0,
      y = 0,
      z = 0,
    ) => {
      const part = mesh(
        new THREE.TorusGeometry(r, 0.045, 8, 32),
        mat,
        parent,
        x,
        y,
        z,
      );
      part.rotation.x = -Math.PI / 2;
      return part;
    };
    const avatar = new THREE.Group();
    scene.add(avatar);
    if (guitar) {
      avatar.position.set(0, 0.65, -17);
      avatar.scale.setScalar(2);
    }
    const torso = new THREE.Group();
    avatar.add(torso);
    for (const x of [-0.24, 0.24]) {
      box(0.3, 0.85, 0.35, ink, avatar, x, 0.5);
      box(0.36, 0.18, 0.6, ink, avatar, x, 0.09, 0.13);
      box(0.31, 0.08, 0.37, accent, avatar, x, 0.3, 0.02);
    }
    box(0.93, 0.85, 0.53, guitar ? material(0x5f2b93) : ink, torso, 0, 1.55);
    box(0.38, 0.65, 0.055, white, torso, 0, 1.65, 0.29);
    for (const x of [-0.17, 0.17]) {
      const lapel = box(0.16, 0.62, 0.07, ink, torso, x, 1.65, 0.34);
      lapel.rotation.z = x > 0 ? -0.28 : 0.28;
    }
    const bow = material(guitar ? 0x40e5d5 : 0xb72a53);
    for (const x of [-0.09, 0.09]) {
      const tie = ball(0.12, bow, torso, x, 1.97, 0.35);
      tie.scale.set(1, 0.65, 0.5);
    }
    box(0.24, 0.24, 0.25, gold, torso, 0, 2.1);
    const head = new THREE.Group();
    head.position.y = 2.57;
    torso.add(head);
    const skull = box(0.8, 0.7, 0.62, fur, head);
    skull.geometry.computeVertexNormals();
    box(0.64, 0.23, 0.06, ink, head, 0, 0.03, 0.34);
    for (const x of [-0.18, 0.18])
      box(0.13, 0.055, 0.025, accent, head, x, 0.04, 0.38);
    if (guitar) {
      for (const x of [-0.29, 0.29]) {
        const ear = mesh(
          new THREE.ConeGeometry(0.23, 0.55, 4),
          fur,
          head,
          x,
          0.56,
        );
        ear.rotation.z = x > 0 ? -0.2 : 0.2;
        const inner = mesh(
          new THREE.ConeGeometry(0.12, 0.32, 4),
          accent,
          head,
          x,
          0.56,
          0.12,
        );
        inner.rotation.z = ear.rotation.z;
      }
      const muzzle = ball(0.23, white, head, 0, -0.22, 0.35);
      muzzle.scale.set(1.25, 0.7, 1);
      ball(0.08, ink, head, 0, -0.16, 0.56);
      const tail = mesh(
        new THREE.ConeGeometry(0.25, 1.3, 8),
        fur,
        torso,
        0.62,
        1,
        -0.3,
      );
      tail.rotation.z = -0.7;
      const tuft = mesh(
        new THREE.ConeGeometry(0.17, 0.5, 4),
        accent,
        head,
        0,
        0.48,
      );
      tuft.rotation.z = -0.3;
    } else {
      box(0.8, 0.14, 0.68, ink, head, 0, 0.44);
      box(1.03, 0.06, 0.78, gold, head, 0, 0.35);
      box(0.3, 0.035, 0.03, gold, head, 0, -0.19, 0.34);
    }
    const arm = (x: number) => {
      const shoulder = new THREE.Group();
      shoulder.position.set(x, 1.9, 0);
      torso.add(shoulder);
      ball(0.17, gold, shoulder);
      box(0.25, 0.58, 0.28, ink, shoulder, 0, -0.31);
      const elbow = new THREE.Group();
      elbow.position.y = -0.6;
      shoulder.add(elbow);
      ball(0.14, gold, elbow);
      box(0.21, 0.49, 0.25, ink, elbow, 0, -0.25);
      ball(0.16, white, elbow, 0, -0.55);
      return { shoulder, elbow };
    };
    const left = arm(-0.6),
      right = arm(0.6);
    if (guitar) {
      const instrument = new THREE.Group();
      instrument.position.set(0.05, 1.2, 0.62);
      instrument.rotation.z = -0.65;
      torso.add(instrument);
      const body = material(0x32d9cd, 0.7),
        pickguard = material(0xf0b551, 0.6);
      const lower = ball(0.43, body, instrument, 0, -0.12);
      lower.scale.set(1, 0.95, 0.23);
      const upper = ball(0.3, body, instrument, 0, 0.28);
      upper.scale.set(1, 0.9, 0.3);
      box(0.23, 0.48, 0.12, pickguard, instrument, 0, 0.02, 0.1);
      box(0.16, 1.5, 0.1, ink, instrument, 0, 1.02);
      box(0.27, 0.4, 0.12, body, instrument, 0, 1.91);
      for (let n = 0; n < 12; n++)
        box(0.18, 0.014, 0.018, gold, instrument, 0, 0.37 + n * 0.115, 0.065);
      for (let n = 0; n < 6; n++)
        box(
          0.008,
          1.96,
          0.012,
          white,
          instrument,
          -0.055 + n * 0.022,
          0.65,
          0.09,
        );
      box(0.13, 0.04, 0.04, ink, instrument, 0, -0.1, 0.14);
      left.shoulder.rotation.z = -0.65;
      left.shoulder.rotation.x = -0.8;
      left.elbow.rotation.x = -1.35;
      right.shoulder.rotation.z = 0.45;
      right.shoulder.rotation.x = -0.55;
      right.elbow.rotation.x = -0.9;
      const strap = box(0.11, 1.12, 0.045, ink, torso, -0.12, 1.55, 0.4);
      strap.rotation.z = -0.55;
    }
    const podium = mesh(
      new THREE.CylinderGeometry(
        guitar ? 3 : 2.7,
        guitar ? 3.2 : 2.9,
        0.25,
        48,
      ),
      ink,
      scene,
      0,
      guitar ? 0.45 : 0.65,
      guitar ? -17 : 1.25,
    );
    ring(
      guitar ? 3 : 2.7,
      gold,
      scene,
      0,
      podium.position.y + 0.14,
      podium.position.z,
    );
    if (!guitar) {
      const felt = mesh(
        new THREE.CylinderGeometry(2.6, 2.6, 0.035, 48),
        material(0x185b42),
        scene,
        0,
        0.79,
        1.25,
      );
      felt.scale.z = 0.68;
      const cards = new THREE.Group();
      scene.add(cards);
      cards.position.set(-1, 0.86, 1.3);
      for (let i = 0; i < 3; i++) {
        const card = box(0.3, 0.018, 0.44, white, cards, i * 0.32, 0, 0);
        card.rotation.y = i * 0.2;
      }
      for (let i = 0; i < 4; i++)
        mesh(
          new THREE.CylinderGeometry(0.13, 0.13, 0.035, 24),
          i % 2 ? gold : accent,
          scene,
          1,
          0.84 + i * 0.04,
          1.1,
        );
    }
    const notePool: THREE.Mesh[] = [];
    const targets: THREE.Mesh[] = [];
    if (guitar) {
      box(5, 0.12, 24, material(0x11182d, 0.65), scene, 0, -0.13, -6.5);
      for (let lane = 0; lane < 4; lane++) {
        const mat = material(COLORS[lane], 0.5, true);
        box(0.025, 0.02, 24, mat, scene, -2.4 + lane * 1.2, 0.01, -6.5);
        targets.push(ring(0.37, mat, scene, -1.8 + lane * 1.2, 0.08, 4.5));
      }
      box(0.025, 0.02, 24, accent, scene, 2.4, 0.01, -6.5);
      for (let i = 0; i < 18; i++) {
        const n = mesh(
          new THREE.SphereGeometry(0.32, 16, 10),
          material(COLORS[i % 4], 0.55, true),
          scene,
        );
        n.scale.set(1, 0.3, 1);
        n.visible = false;
        notePool.push(n);
      }
      for (let side = -1; side <= 1; side += 2)
        for (let i = 0; i < 5; i++) {
          box(
            0.07,
            7,
            0.07,
            i % 2 ? accent : gold,
            scene,
            side * (4 + i * 0.6),
            3,
            -17 + i * 3,
          );
          ball(0.14, accent, scene, side * (4 + i * 0.6), 6.5, -17 + i * 3);
        }
    }
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      visible = true;
    const intersection = new IntersectionObserver((entries) => {
      visible = entries[0]?.isIntersecting ?? true;
    });
    intersection.observe(host);
    const offset = () => latest.current.serverNow - Date.now();
    let previousServer = latest.current.serverNow,
      clockOffset = offset();
    const render = (time: number) => {
      frame = requestAnimationFrame(render);
      if (document.hidden || !visible) return;
      const current = latest.current;
      if (current.serverNow !== previousServer) {
        previousServer = current.serverNow;
        clockOffset = offset();
      }
      const moving = current.active && !reduced.matches;
      const t = time / 1000;
      torso.rotation.z = moving ? Math.sin(t * (guitar ? 3 : 1)) * 0.035 : 0;
      head.rotation.y = moving ? Math.sin(t * 0.8) * 0.12 : 0;
      if (guitar) {
        right.elbow.rotation.z = moving ? Math.sin(t * 17) * 0.24 : 0;
        avatar.position.y = 0.65 + (moving ? Math.sin(t * 6) * 0.045 : 0);
        let poolIndex = 0;
        const judged = new Set(current.judged ?? []);
        const songTime = Date.now() + clockOffset;
        for (let i = 0; i < (current.notes?.length ?? 0); i++) {
          const note = current.notes![i],
            delta =
              (current.startsAt ?? 0) +
              note.at +
              150 +
              (current.adjust ?? 0) -
              songTime;
          if (delta < -150 || delta > 1900 || judged.has(i)) continue;
          const object = notePool[poolIndex++];
          if (!object) break;
          object.visible = true;
          object.position.set(
            -1.8 + note.lane * 1.2,
            0.16,
            4.5 - (delta / 1800) * 23,
          );
          (object.material as THREE.MeshStandardMaterial).color.setHex(
            COLORS[note.lane],
          );
          (object.material as THREE.MeshStandardMaterial).emissive.setHex(
            COLORS[note.lane],
          );
        }
        for (let i = poolIndex; i < notePool.length; i++)
          notePool[i].visible = false;
        targets.forEach((target, i) =>
          target.scale.setScalar(current.flash === i ? 1.3 : 1),
        );
      } else {
        right.shoulder.rotation.x =
          -0.75 + (moving ? Math.sin(t * 1.6) * 0.22 : 0);
        right.shoulder.rotation.z = 0.18;
        right.elbow.rotation.x = -0.6;
        left.shoulder.rotation.x = -0.7;
        left.elbow.rotation.x = -0.8 + (moving ? Math.sin(t * 1.2) * 0.1 : 0);
      }
      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(render);
    const contextLost = (e: Event) => {
      e.preventDefault();
      setUnavailable(true);
    };
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      intersection.disconnect();
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          for (const mat of Array.isArray(object.material)
            ? object.material
            : [object.material])
            mat.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [props.variant]);
  return (
    <div
      className={`party-stage ${props.variant} ${unavailable ? "stage-unavailable" : ""}`}
    >
      <div
        ref={mount}
        className="party-stage-canvas"
        role="img"
        aria-label={
          props.variant === "dealer"
            ? "Vega, dealer robô 3D de smoking"
            : "Riff, raposa robótica 3D tocando guitarra neon"
        }
      />
      <span className="party-stage-caption">
        {props.variant === "dealer" ? "VEGA · SEU DEALER" : "RIFF · NEON LIVE"}
      </span>
      {unavailable && (
        <span className="party-stage-fallback">
          {props.variant === "dealer"
            ? "♠ Vega está na mesa"
            : "♫ Riff está no palco"}{" "}
          · Visual 3D indisponível neste dispositivo
        </span>
      )}
    </div>
  );
}
