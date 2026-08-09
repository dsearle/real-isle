"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";

const TERRAIN_SOURCE = "/iom-terrain.png";
const SNAEFELL_HEIGHT_METRES = 621;
const VERTICAL_RELIEF = 0.34;
const LAND_THRESHOLD_METRES = 0.75;
const MESH_COLUMNS = 240;

const elevationStops = [
  { height: 0, colour: new THREE.Color("#496f55") },
  { height: 90, colour: new THREE.Color("#69845d") },
  { height: 210, colour: new THREE.Color("#82805b") },
  { height: 360, colour: new THREE.Color("#776953") },
  { height: 500, colour: new THREE.Color("#998b73") },
  { height: SNAEFELL_HEIGHT_METRES, colour: new THREE.Color("#c7bdab") },
];
const shadedRock = new THREE.Color("#354d43");

type TerrainPoint = {
  height: number;
  x: number;
  z: number;
};

function decodeTerrarium(red: number, green: number, blue: number) {
  return red * 256 + green + blue / 256 - 32768;
}

function readElevation(
  pixels: Uint8ClampedArray,
  imageWidth: number,
  imageHeight: number,
  sourceX: number,
  sourceY: number,
) {
  const x0 = Math.floor(sourceX);
  const y0 = Math.floor(sourceY);
  const x1 = Math.min(imageWidth - 1, x0 + 1);
  const y1 = Math.min(imageHeight - 1, y0 + 1);
  const mixX = sourceX - x0;
  const mixY = sourceY - y0;
  const decodeAt = (x: number, y: number) => {
    const index = (y * imageWidth + x) * 4;
    return decodeTerrarium(pixels[index], pixels[index + 1], pixels[index + 2]);
  };
  const top = THREE.MathUtils.lerp(decodeAt(x0, y0), decodeAt(x1, y0), mixX);
  const bottom = THREE.MathUtils.lerp(decodeAt(x0, y1), decodeAt(x1, y1), mixX);
  return Math.max(0, THREE.MathUtils.lerp(top, bottom, mixY));
}

function elevationColour(height: number, ruggedness: number, directionalShade: number) {
  const upperStopIndex = elevationStops.findIndex((stop) => height <= stop.height);
  const upper = elevationStops[Math.max(1, upperStopIndex === -1 ? elevationStops.length - 1 : upperStopIndex)];
  const lower = elevationStops[Math.max(0, elevationStops.indexOf(upper) - 1)];
  const span = Math.max(1, upper.height - lower.height);
  const colour = lower.colour
    .clone()
    .lerp(upper.colour, THREE.MathUtils.clamp((height - lower.height) / span, 0, 1));
  colour.lerp(shadedRock, ruggedness * 0.18);
  colour.offsetHSL(0, -ruggedness * 0.025, directionalShade);
  return colour;
}

function heightToWorld(height: number) {
  return (height / SNAEFELL_HEIGHT_METRES) * VERTICAL_RELIEF;
}

function appendIsolines(
  target: number[],
  heights: Float32Array,
  columns: number,
  rows: number,
  width: number,
  depth: number,
  level: number,
  lift: number,
) {
  const point = (row: number, column: number): TerrainPoint => ({
    height: heights[row * columns + column],
    x: (column / (columns - 1) - 0.5) * width,
    z: (row / (rows - 1) - 0.5) * depth,
  });

  for (let row = 0; row < rows - 1; row += 1) {
    for (let column = 0; column < columns - 1; column += 1) {
      const corners = [
        point(row, column),
        point(row, column + 1),
        point(row + 1, column + 1),
        point(row + 1, column),
      ];
      const crossings: TerrainPoint[] = [];

      for (let edge = 0; edge < 4; edge += 1) {
        const start = corners[edge];
        const end = corners[(edge + 1) % 4];
        if ((start.height < level) === (end.height < level)) continue;
        const progress = (level - start.height) / (end.height - start.height);
        crossings.push({
          height: level,
          x: THREE.MathUtils.lerp(start.x, end.x, progress),
          z: THREE.MathUtils.lerp(start.z, end.z, progress),
        });
      }

      const appendSegment = (start: TerrainPoint, end: TerrainPoint) => {
        const y = heightToWorld(level) + lift;
        target.push(start.x, y, start.z, end.x, y, end.z);
      };
      if (crossings.length === 2) appendSegment(crossings[0], crossings[1]);
      if (crossings.length === 4) {
        appendSegment(crossings[0], crossings[1]);
        appendSegment(crossings[2], crossings[3]);
      }
    }
  }
}

function addLinework(
  group: THREE.Group,
  positions: number[],
  colour: number,
  opacity: number,
) {
  if (positions.length === 0) return;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color: colour,
    depthWrite: false,
    opacity,
    transparent: true,
  });
  group.add(new THREE.LineSegments(geometry, material));
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
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(31, 1, 0.1, 100);
    camera.position.set(0, 5.7, 8.9);
    camera.lookAt(0, 0.1, 0);

    const renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: true,
      canvas,
      powerPreference: "high-performance",
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 700 ? 1.5 : 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.98;

    const terrainGroup = new THREE.Group();
    terrainGroup.rotation.set(-0.1, -0.38, 0);
    terrainGroup.position.y = -0.08;
    scene.add(terrainGroup);

    scene.add(new THREE.HemisphereLight(0xeaf4e8, 0x31483f, 0.9));
    const keyLight = new THREE.DirectionalLight(0xffefd1, 2.2);
    keyLight.position.set(-4.5, 7.5, 4.8);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.left = -5;
    keyLight.shadow.camera.right = 5;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 18;
    keyLight.shadow.bias = -0.0004;
    keyLight.shadow.normalBias = 0.018;
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0x83b8b2, 0.38);
    fillLight.position.set(4, 3, -5);
    scene.add(fillLight);

    const terrainImage = new Image();
    terrainImage.decoding = "async";
    terrainImage.onload = () => {
      if (disposed) return;
      const sampler = document.createElement("canvas");
      sampler.width = terrainImage.naturalWidth || terrainImage.width;
      sampler.height = terrainImage.naturalHeight || terrainImage.height;
      const context = sampler.getContext("2d", { willReadFrequently: true });
      if (!context) {
        setState("error");
        return;
      }
      context.drawImage(terrainImage, 0, 0);
      const pixels = context.getImageData(0, 0, sampler.width, sampler.height).data;

      const columns = MESH_COLUMNS;
      const rows = Math.round(columns * (sampler.height / sampler.width));
      const width = 4.7;
      const depth = width * (sampler.height / sampler.width);
      const heights = new Float32Array(columns * rows);
      const positions = new Float32Array(columns * rows * 3);
      const colours = new Float32Array(columns * rows * 3);
      const indices: number[] = [];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const sourceX = (column / (columns - 1)) * (sampler.width - 1);
          const sourceY = (row / (rows - 1)) * (sampler.height - 1);
          heights[row * columns + column] = readElevation(
            pixels,
            sampler.width,
            sampler.height,
            sourceX,
            sourceY,
          );
        }
      }

      const sampleHeight = (row: number, column: number) =>
        heights[
          THREE.MathUtils.clamp(row, 0, rows - 1) * columns +
            THREE.MathUtils.clamp(column, 0, columns - 1)
        ];

      for (let row = 0; row < rows; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const vertexIndex = row * columns + column;
          const positionIndex = vertexIndex * 3;
          const elevation = heights[vertexIndex];
          const eastWest = sampleHeight(row, column + 1) - sampleHeight(row, column - 1);
          const northSouth = sampleHeight(row + 1, column) - sampleHeight(row - 1, column);
          const ruggedness = THREE.MathUtils.clamp((Math.abs(eastWest) + Math.abs(northSouth)) / 170, 0, 1);
          const directionalShade = THREE.MathUtils.clamp((-eastWest - northSouth) / 1250, -0.055, 0.055);
          const colour = elevationColour(elevation, ruggedness, directionalShade);

          positions[positionIndex] = (column / (columns - 1) - 0.5) * width;
          positions[positionIndex + 1] = heightToWorld(elevation);
          positions[positionIndex + 2] = (row / (rows - 1) - 0.5) * depth;
          colours[positionIndex] = colour.r;
          colours[positionIndex + 1] = colour.g;
          colours[positionIndex + 2] = colour.b;
        }
      }

      const addTriangle = (a: number, b: number, c: number) => {
        const landVertices =
          Number(heights[a] > LAND_THRESHOLD_METRES) +
          Number(heights[b] > LAND_THRESHOLD_METRES) +
          Number(heights[c] > LAND_THRESHOLD_METRES);
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
      geometry.computeBoundingSphere();

      const material = new THREE.MeshStandardMaterial({
        dithering: true,
        metalness: 0,
        roughness: 0.96,
        side: THREE.FrontSide,
        vertexColors: true,
      });
      const terrain = new THREE.Mesh(geometry, material);
      terrain.castShadow = true;
      terrain.receiveShadow = true;
      terrainGroup.add(terrain);

      const minorContours: number[] = [];
      [50, 150, 250, 350, 450, 550].forEach((level) =>
        appendIsolines(minorContours, heights, columns, rows, width, depth, level, 0.006),
      );
      addLinework(terrainGroup, minorContours, 0xf2ead7, 0.12);

      const majorContours: number[] = [];
      [100, 200, 300, 400, 500, 600].forEach((level) =>
        appendIsolines(majorContours, heights, columns, rows, width, depth, level, 0.008),
      );
      addLinework(terrainGroup, majorContours, 0x243f36, 0.25);

      const coastline: number[] = [];
      appendIsolines(
        coastline,
        heights,
        columns,
        rows,
        width,
        depth,
        LAND_THRESHOLD_METRES,
        0.01,
      );
      addLinework(terrainGroup, coastline, 0xf9f0d8, 0.82);
      setState("ready");
    };
    terrainImage.onerror = () => {
      if (!disposed) setState("error");
    };
    terrainImage.src = TERRAIN_SOURCE;

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
      if (event.button !== 0) return;
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
      terrainGroup.rotation.y += deltaX * 0.007;
      terrainGroup.rotation.x = THREE.MathUtils.clamp(terrainGroup.rotation.x + deltaY * 0.003, -0.28, 0.2);
      pointerX = event.clientX;
      pointerY = event.clientY;
    };
    const onPointerUp = (event: PointerEvent) => {
      dragging = false;
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.classList.remove("is-dragging");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const rotationStep = event.shiftKey ? 0.14 : 0.07;
      if (event.key === "ArrowLeft") terrainGroup.rotation.y -= rotationStep;
      else if (event.key === "ArrowRight") terrainGroup.rotation.y += rotationStep;
      else if (event.key === "ArrowUp") {
        terrainGroup.rotation.x = Math.max(-0.28, terrainGroup.rotation.x - rotationStep / 2);
      } else if (event.key === "ArrowDown") {
        terrainGroup.rotation.x = Math.min(0.2, terrainGroup.rotation.x + rotationStep / 2);
      } else return;
      event.preventDefault();
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("keydown", onKeyDown);

    const render = () => {
      if (!dragging && !reducedMotion) terrainGroup.rotation.y += 0.00065;
      renderer.render(scene, camera);
      animationFrame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      disposed = true;
      terrainImage.onload = null;
      terrainImage.onerror = null;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("keydown", onKeyDown);
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.LineSegments)) return;
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
        aria-label="Interactive 3D terrain model of the Isle of Man, built from high-resolution elevation data. Drag to rotate and tilt, or use the arrow keys."
        className="terrain-canvas"
        ref={canvasRef}
        role="img"
        tabIndex={0}
      />
      {state === "loading" ? <span className="terrain-status">Reading the landscape…</span> : null}
      {state === "error" ? <span className="terrain-status terrain-error">Terrain unavailable</span> : null}
      <div className="terrain-data-chip">
        <strong>OUR ACTUAL ISLAND</strong>
        <span>Give it a spin · Snaefell 621m · relief shown at 5×</span>
        <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">
          Elevation: Mapzen / AWS Open Data ↗
        </a>
      </div>
    </div>
  );
}
