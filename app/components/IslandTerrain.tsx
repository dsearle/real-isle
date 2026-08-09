"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const TERRAIN_SOURCE = "/iom-terrain.png";
const SNAEFELL_HEIGHT_METRES = 621;

function decodeTerrarium(red: number, green: number, blue: number) {
  return red * 256 + green + blue / 256 - 32768;
}

function elevationColour(height: number) {
  const low = new THREE.Color("#2f7767");
  const middle = new THREE.Color("#78a97c");
  const high = new THREE.Color("#d5c47f");
  const summit = new THREE.Color("#efe0b1");
  const ratio = THREE.MathUtils.clamp(height / SNAEFELL_HEIGHT_METRES, 0, 1);

  if (ratio < 0.38) return low.lerp(middle, ratio / 0.38);
  if (ratio < 0.76) return middle.lerp(high, (ratio - 0.38) / 0.38);
  return high.lerp(summit, (ratio - 0.76) / 0.24);
}

export function IslandTerrain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!canvas || !host) return;

    let animationFrame = 0;
    let disposed = false;
    let terrainTexture: THREE.Texture | null = null;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(0, 5.8, 8.8);
    camera.lookAt(0, 0.35, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const terrainGroup = new THREE.Group();
    terrainGroup.rotation.set(-0.06, -0.38, 0);
    scene.add(terrainGroup);

    scene.add(new THREE.HemisphereLight(0xdff7f0, 0x06262d, 2.15));
    const keyLight = new THREE.DirectionalLight(0xffedb0, 3.4);
    keyLight.position.set(-4, 8, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x4fd7ce, 2.4);
    rimLight.position.set(5, 2, -5);
    scene.add(rimLight);

    const textureLoader = new THREE.TextureLoader();
    textureLoader.load(
      TERRAIN_SOURCE,
      (texture) => {
        if (disposed) {
          texture.dispose();
          return;
        }
        terrainTexture = texture;
        const image = texture.image as HTMLImageElement;
        const sampler = document.createElement("canvas");
        sampler.width = image.naturalWidth || image.width;
        sampler.height = image.naturalHeight || image.height;
        const context = sampler.getContext("2d", { willReadFrequently: true });
        if (!context) {
          setState("error");
          return;
        }
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, sampler.width, sampler.height).data;

        const columns = 108;
        const rows = 128;
        const width = 4.85;
        const depth = 5.72;
        const heights = new Float32Array(columns * rows);
        const positions = new Float32Array(columns * rows * 3);
        const colours = new Float32Array(columns * rows * 3);
        const indices: number[] = [];

        for (let row = 0; row < rows; row += 1) {
          for (let column = 0; column < columns; column += 1) {
            const sourceX = Math.min(
              sampler.width - 1,
              Math.round((column / (columns - 1)) * (sampler.width - 1)),
            );
            const sourceY = Math.min(
              sampler.height - 1,
              Math.round((row / (rows - 1)) * (sampler.height - 1)),
            );
            const pixelIndex = (sourceY * sampler.width + sourceX) * 4;
            const elevation = Math.max(
              0,
              decodeTerrarium(
                pixels[pixelIndex],
                pixels[pixelIndex + 1],
                pixels[pixelIndex + 2],
              ),
            );
            const vertexIndex = row * columns + column;
            const positionIndex = vertexIndex * 3;
            const colour = elevationColour(elevation);
            heights[vertexIndex] = elevation;
            positions[positionIndex] = (column / (columns - 1) - 0.5) * width;
            positions[positionIndex + 1] = (elevation / SNAEFELL_HEIGHT_METRES) * 1.32;
            positions[positionIndex + 2] = (row / (rows - 1) - 0.5) * depth;
            colours[positionIndex] = colour.r;
            colours[positionIndex + 1] = colour.g;
            colours[positionIndex + 2] = colour.b;
          }
        }

        const addTriangle = (a: number, b: number, c: number) => {
          const landVertices = Number(heights[a] > 0.75) + Number(heights[b] > 0.75) + Number(heights[c] > 0.75);
          if (landVertices >= 2) indices.push(a, b, c);
        };

        for (let row = 0; row < rows - 1; row += 1) {
          for (let column = 0; column < columns - 1; column += 1) {
            const topLeft = row * columns + column;
            const topRight = topLeft + 1;
            const bottomLeft = topLeft + columns;
            const bottomRight = bottomLeft + 1;
            addTriangle(topLeft, bottomLeft, topRight);
            addTriangle(topRight, bottomLeft, bottomRight);
          }
        }

        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute("color", new THREE.BufferAttribute(colours, 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.center();

        const material = new THREE.MeshStandardMaterial({
          metalness: 0.06,
          roughness: 0.78,
          side: THREE.DoubleSide,
          vertexColors: true,
        });
        const terrain = new THREE.Mesh(geometry, material);
        terrainGroup.add(terrain);

        const contourMaterial = new THREE.MeshBasicMaterial({
          color: 0xd7eee7,
          opacity: 0.1,
          transparent: true,
          wireframe: true,
        });
        const contours = new THREE.Mesh(geometry, contourMaterial);
        contours.position.y = 0.012;
        terrainGroup.add(contours);
        setState("ready");
      },
      undefined,
      () => setState("error"),
    );

    const resize = () => {
      const bounds = host.getBoundingClientRect();
      if (!bounds.width || !bounds.height) return;
      renderer.setSize(bounds.width, bounds.height, false);
      camera.aspect = bounds.width / bounds.height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let dragging = false;
    let pointerX = 0;
    let pointerY = 0;

    const onPointerDown = (event: PointerEvent) => {
      dragging = true;
      pointerX = event.clientX;
      pointerY = event.clientY;
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("is-dragging");
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const deltaX = event.clientX - pointerX;
      const deltaY = event.clientY - pointerY;
      terrainGroup.rotation.y += deltaX * 0.008;
      terrainGroup.rotation.x = THREE.MathUtils.clamp(terrainGroup.rotation.x + deltaY * 0.004, -0.32, 0.28);
      pointerX = event.clientX;
      pointerY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.classList.remove("is-dragging");
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);

    const animationStartedAt = performance.now();
    const render = (timestamp = performance.now()) => {
      const elapsed = (timestamp - animationStartedAt) / 1000;
      if (!dragging && !reducedMotion) terrainGroup.rotation.y += 0.0012;
      terrainGroup.position.y = reducedMotion ? 0 : Math.sin(elapsed * 0.7) * 0.045;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      terrainTexture?.dispose();
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      });
      renderer.dispose();
    };
  }, []);

  return (
    <div className="terrain-island" ref={hostRef}>
      <canvas
        aria-label="Interactive 3D terrain model of the Isle of Man. Drag to rotate and tilt."
        className="terrain-canvas"
        ref={canvasRef}
        role="img"
      />
      {state === "loading" ? <span className="terrain-status">Building real terrain…</span> : null}
      {state === "error" ? <span className="terrain-status terrain-error">Terrain unavailable</span> : null}
      <div className="terrain-data-chip">
        <strong>OUR ACTUAL ISLAND</strong>
        <span>Give it a spin · Snaefell 621m</span>
        <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">
          Elevation: Mapzen / AWS Open Data ↗
        </a>
      </div>
    </div>
  );
}
