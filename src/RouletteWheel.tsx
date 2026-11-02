import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { POCKETS, RED, pocketColor } from "./rouletteRules";
export default function RouletteWheel({
  number = null,
  startsAt = 0,
  endsAt = 0,
  serverNow = Date.now(),
  running = false,
}: {
  number?: number | null;
  startsAt?: number;
  endsAt?: number;
  serverNow?: number;
  running?: boolean;
}) {
  const mount = useRef<HTMLDivElement>(null);
  const latest = useRef({
    number,
    startsAt,
    endsAt,
    offset: serverNow - Date.now(),
    running,
  });
  const [fallback, setFallback] = useState(false);
  useEffect(() => {
    latest.current = {
      number,
      startsAt,
      endsAt,
      offset: serverNow - Date.now(),
      running,
    };
  }, [number, startsAt, endsAt, serverNow, running]);
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFallback(true);
      return;
    }
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 60);
    camera.position.set(0, 8.4, 9.2);
    camera.lookAt(0, 0, 0);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor(0, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    el.appendChild(renderer.domElement);
    const ambient = new THREE.HemisphereLight(0xfff1d0, 0x102c22, 3);
    scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffe6b2, 5);
    key.position.set(-4, 9, 5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xc0d4ff, 2);
    fill.position.set(5, 6, -4);
    scene.add(fill);
    const gold = new THREE.MeshStandardMaterial({
      color: 0xcc9b48,
      metalness: 0.82,
      roughness: 0.25,
    });
    const wood = new THREE.MeshStandardMaterial({
      color: 0x321712,
      metalness: 0.2,
      roughness: 0.35,
    });
    const black = new THREE.MeshStandardMaterial({
      color: 0x151c1b,
      roughness: 0.45,
    });
    const wheel = new THREE.Group();
    scene.add(wheel);
    function cylinder(
      radius: number,
      height: number,
      y: number,
      material: THREE.Material,
      parent: THREE.Object3D = scene,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, height, 128),
        material,
      );
      mesh.position.y = y;
      parent.add(mesh);
      return mesh;
    }
    function ring(
      radius: number,
      tube: number,
      y: number,
      parent: THREE.Object3D = scene,
    ) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(radius, tube, 12, 160),
        gold,
      );
      mesh.rotation.x = Math.PI / 2;
      mesh.position.y = y;
      parent.add(mesh);
    }
    cylinder(4, 0.32, -0.22, wood);
    cylinder(3.8, 0.2, -0.01, black);
    ring(3.95, 0.1, -0.05);
    ring(3.65, 0.075, 0.12);
    ring(3.32, 0.045, 0.22, wheel);
    ring(2.36, 0.045, 0.23, wheel);
    cylinder(2.32, 0.22, 0.11, wood, wheel);
    ring(2.15, 0.025, 0.25, wheel);
    cylinder(0.68, 0.12, 0.26, gold, wheel);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.48, 0.85, 64), gold);
    cone.position.y = 0.7;
    wheel.add(cone);
    const spindle = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 24, 16),
      gold,
    );
    spindle.position.y = 1.19;
    wheel.add(spindle);
    const cross = new THREE.Mesh(
      new THREE.CylinderGeometry(0.04, 0.04, 1.65, 16),
      gold,
    );
    cross.rotation.z = Math.PI / 2;
    cross.position.y = 0.65;
    wheel.add(cross);
    const step = (Math.PI * 2) / 37;
    POCKETS.forEach((n, i) => {
      const angle = i * step,
        lo = angle - step / 2,
        hi = angle + step / 2;
      const vertices = [];
      for (let j = 0; j < 6; j++) {
        const a = lo + ((hi - lo) * j) / 6,
          b = lo + ((hi - lo) * (j + 1)) / 6;
        vertices.push(
          Math.sin(a) * 2.38,
          0.25,
          Math.cos(a) * 2.38,
          Math.sin(a) * 3.29,
          0.25,
          Math.cos(a) * 3.29,
          Math.sin(b) * 3.29,
          0.25,
          Math.cos(b) * 3.29,
          Math.sin(a) * 2.38,
          0.25,
          Math.cos(a) * 2.38,
          Math.sin(b) * 3.29,
          0.25,
          Math.cos(b) * 3.29,
          Math.sin(b) * 2.38,
          0.25,
          Math.cos(b) * 2.38,
        );
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.Float32BufferAttribute(vertices, 3),
      );
      geometry.computeVertexNormals();
      wheel.add(
        new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({
            color: n === 0 ? 0x126c46 : RED.has(n) ? 0x9e202b : 0x15191d,
            side: THREE.DoubleSide,
            roughness: 0.55,
          }),
        ),
      );
      const separator = new THREE.Mesh(
        new THREE.BoxGeometry(0.018, 0.045, 0.94),
        gold,
      );
      separator.position.set(Math.sin(lo) * 2.83, 0.28, Math.cos(lo) * 2.83);
      separator.rotation.y = lo;
      wheel.add(separator);
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff5df";
      ctx.font = "bold 76px Georgia";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n), 64, 64);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Mesh(
        new THREE.PlaneGeometry(0.32, 0.32),
        new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          side: THREE.DoubleSide,
        }),
      );
      label.position.set(Math.sin(angle) * 3.04, 0.3, Math.cos(angle) * 3.04);
      label.rotation.set(-Math.PI / 2, 0, -angle);
      wheel.add(label);
    });
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.105, 24, 16),
      new THREE.MeshStandardMaterial({
        color: 0xfff7de,
        metalness: 0.2,
        roughness: 0.14,
      }),
    );
    scene.add(ball);
    const resize = () => {
      const width = el.clientWidth || 500,
        height = el.clientHeight || 360;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.fov = 40;
      const direction = new THREE.Vector3(0, 8.4, 9.2).normalize();
      let distance = 11;
      // Fit the entire housing and spindle, then aim slightly below its centre
      // to lift the wheel without cropping it in narrow dock panels.
      for (let attempt = 0; attempt < 24; attempt++) {
        camera.position.copy(direction).multiplyScalar(distance);
        camera.lookAt(0, -0.9, 0);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld();
        const corners = [new THREE.Vector3(0, 1.4, 0).project(camera)];
        for (let i = 0; i < 64; i++)
          for (const y of [-0.55, 0.35]) {
            const angle = (i * Math.PI * 2) / 64;
            corners.push(
              new THREE.Vector3(
                Math.sin(angle) * 4.2,
                y,
                Math.cos(angle) * 4.2,
              ).project(camera),
            );
          }
        if (
          corners.every(
            (p) => Math.abs(p.x) < 0.91 && p.y < 0.88 && p.y > -0.79,
          )
        )
          break;
        distance *= 1.055;
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0,
      disposed = false;
    const render = () => {
      if (disposed) return;
      const s = latest.current;
      const progress =
        s.endsAt > s.startsAt
          ? Math.min(
              1,
              Math.max(
                0,
                (Date.now() + s.offset - s.startsAt) / (s.endsAt - s.startsAt),
              ),
            )
          : 0;
      const eased = 1 - Math.pow(1 - progress, 3);
      const final = s.number === null ? 0 : POCKETS.indexOf(s.number) * step;
      const motion = media.matches ? 1 : eased;
      wheel.rotation.y = s.number === null ? 0 : Math.PI * 8 * motion;
      const angle =
        s.number === null ? 0.3 : -Math.PI * 14 * motion + final * motion;
      const drop =
          media.matches && s.number !== null
            ? 1
            : Math.max(0, (progress - 0.7) / 0.3),
        radius = s.number === null ? 3.5 : 3.5 - 0.72 * Math.min(1, drop);
      ball.position.set(
        Math.sin(angle) * radius,
        0.37 +
          (!media.matches && s.running && progress < 0.98
            ? Math.abs(Math.sin(progress * 70)) * 0.1 * (1 - drop)
            : 0),
        Math.cos(angle) * radius,
      );
      if (!document.hidden && el.getBoundingClientRect().width > 0)
        renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    render();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material)
            ? object.material
            : [object.material];
          for (const material of materials) {
            for (const value of Object.values(material))
              if (value instanceof THREE.Texture) value.dispose();
            material.dispose();
          }
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      className="roulette-stage"
      aria-label="Roleta europeia de 37 casas"
      data-renderer={fallback ? "fallback" : "webgl"}
    >
      <div className="roulette-canvas" ref={mount} />
      {fallback && (
        <div
          className="roulette-fallback"
          style={{
            transform: `rotateX(25deg) rotate(${number === null ? 0 : (-POCKETS.indexOf(number) * 360) / 37}deg)`,
          }}
        >
          {POCKETS.map((n, i) => (
            <span
              key={n}
              className={pocketColor(n)}
              style={{
                transform: `rotate(${(i * 360) / 37}deg) translateY(-135px) rotate(180deg)`,
              }}
            >
              {n}
            </span>
          ))}
          <b>♛</b>
        </div>
      )}
      <span className="roulette-stage-label">
        EUROPEAN ROULETTE <i>•</i> SINGLE ZERO
      </span>
      {fallback && (
        <small className="roulette-fallback-note">
          Modo gráfico simplificado · WebGL indisponível
        </small>
      )}
    </div>
  );
}
