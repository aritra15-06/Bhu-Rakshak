import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { useSiteState } from "../state/SiteStateContext";

const STATE_COLORS = {
  STABLE: "#4a7a5c",
  MARGINAL: "#d97706",
  UNSTABLE: "#dc2626",
  UNKNOWN: "#64748b",
};

const STATE_HEX = {
  STABLE: 0x4a7a5c,
  MARGINAL: 0xd97706,
  UNSTABLE: 0xdc2626,
  UNKNOWN: 0x64748b,
};

function createStationBillboard(name, locationId, colorHex) {
  const canvas = document.createElement("canvas");
  canvas.width = 340;
  canvas.height = 80;
  const ctx = canvas.getContext("2d");

  // Background rounded pill
  ctx.fillStyle = "rgba(15, 23, 42, 0.88)";
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(4, 4, 332, 72, 12);
  } else {
    ctx.rect(4, 4, 332, 72);
  }
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = colorHex;
  ctx.stroke();

  // Status indicator dot
  ctx.fillStyle = colorHex;
  ctx.beginPath();
  ctx.arc(32, 40, 9, 0, Math.PI * 2);
  ctx.fill();

  // Station Label
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 20px system-ui, -apple-system, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const shortName = name.length > 18 ? name.substring(0, 16) + "…" : name;
  ctx.fillText(`${locationId} · ${shortName}`, 52, 40);

  const tex = new THREE.CanvasTexture(canvas);
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(65, 15.5, 1);
  return sprite;
}

export function Terrain3DView() {
  const mountRef = useRef(null);
  const { sites, setSelectedSite, loading } = useSiteState();
  const [heightmap, setHeightmap] = useState(null);
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [mode, setMode] = useState(typeof navigator !== "undefined" && navigator.onLine ? "satellite" : "offline");
  const sceneRef = useRef({});

  // Detect live network connection status
  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
    }
    function onOffline() {
      setIsOnline(false);
      setMode("offline");
    }
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // Fetch heightmap elevation grid with resilient synthetic fallback
  useEffect(() => {
    fetch("/terrain3d/heightmaps/north_sikkim_region_heightmap.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (data?.heights && data?.grid_size) {
          setHeightmap(data);
        } else {
          throw new Error("Invalid heightmap payload");
        }
      })
      .catch((e) => {
        console.warn("Using fallback synthetic terrain elevation model:", e);
        // Resilient North Sikkim Himalayan elevation profile: 1200m - 4200m
        const gridSize = 64;
        const heights = [];
        for (let j = 0; j < gridSize; j++) {
          for (let i = 0; i < gridSize; i++) {
            const x = (i - gridSize / 2) / 10.0;
            const y = (j - gridSize / 2) / 10.0;
            const base = 2600 + Math.sin(x * 0.7) * 750 + Math.cos(y * 0.7) * 850;
            const ridge = Math.abs(Math.sin(x * 1.4 + y * 0.6)) * 600;
            heights.push(Math.round(base + ridge));
          }
        }
        setHeightmap({ grid_size: gridSize, heights });
      });
  }, []);

  // Switch terrain texture smoothly between live satellite and offline landscape
  useEffect(() => {
    if (sceneRef.current?.terrainMesh) {
      const { terrainMesh, satTex, offlineTex } = sceneRef.current;
      const targetTex = mode === "satellite" ? satTex : offlineTex;
      if (targetTex) {
        terrainMesh.material.map = targetTex;
        terrainMesh.material.needsUpdate = true;
      }
    }
  }, [mode]);

  useEffect(() => {
    if (!heightmap || !mountRef.current) return;
    const mount = mountRef.current;
    const width = mount.clientWidth || 800;
    const height = mount.clientHeight || 600;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbdd5e7);
    scene.fog = new THREE.FogExp2(0xbdd5e7, 0.0005);

    const camera = new THREE.PerspectiveCamera(45, width / height, 1, 5000);
    camera.position.set(0, 480, 680);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    mount.innerHTML = "";
    mount.appendChild(renderer.domElement);

    const ambient = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambient);

    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.2);
    sunLight.position.set(300, 500, 200);
    sunLight.castShadow = true;
    scene.add(sunLight);

    const hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x3f3f46, 0.5);
    scene.add(hemiLight);

    // Build 3D terrain elevation mesh
    const gridSize = heightmap.grid_size;
    const planeSize = 800;
    const geometry = new THREE.PlaneGeometry(planeSize, planeSize, gridSize - 1, gridSize - 1);
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position;
    const treePositions = [];

    for (let j = 0; j < gridSize; j++) {
      for (let i = 0; i < gridSize; i++) {
        const idx = j * gridSize + i;
        const elevation = heightmap.heights[idx];
        const y = (elevation - 2000) * 0.14;
        positions.setY(idx, y);

        // Collect tree coordinates for valley areas (<2200m)
        if (elevation > 1000 && elevation < 2200 && (i * 7 + j * 13) % 15 === 0) {
          const u = i / (gridSize - 1);
          const v = j / (gridSize - 1);
          const tx = (u - 0.5) * planeSize + (Math.sin(idx) * 4);
          const tz = (v - 0.5) * planeSize + (Math.cos(idx) * 4);
          treePositions.push({ x: tx, y, z: tz, scale: 0.6 + Math.random() * 0.5 });
        }
      }
    }
    positions.needsUpdate = true;
    geometry.computeVertexNormals();

    // Load textures: offline realistic landscape & local high-res satellite
    const texLoader = new THREE.TextureLoader();
    texLoader.setCrossOrigin("anonymous");

    // 1. Offline realistic texture with lush Himalayan vegetation
    const offlineTex = texLoader.load("/terrain3d/textures/north_sikkim_offline_realistic.jpg");
    offlineTex.wrapS = THREE.ClampToEdgeWrapping;
    offlineTex.wrapT = THREE.ClampToEdgeWrapping;

    // 2. High-res Satellite texture - local bundled asset loaded immediately for instant render
    let satTex = texLoader.load("/terrain3d/textures/north_sikkim_satellite.jpg", (localTex) => {
      localTex.wrapS = THREE.ClampToEdgeWrapping;
      localTex.wrapT = THREE.ClampToEdgeWrapping;
      if (sceneRef.current?.terrainMesh && mode === "satellite") {
        sceneRef.current.terrainMesh.material.map = localTex;
        sceneRef.current.terrainMesh.material.needsUpdate = true;
      }
    });
    satTex.wrapS = THREE.ClampToEdgeWrapping;
    satTex.wrapT = THREE.ClampToEdgeWrapping;

    // If online, optionally upgrade to live ArcGIS satellite imagery in the background
    if (isOnline) {
      const LIVE_SATELLITE_URL =
        "https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/export?bbox=88.45,27.05,88.80,27.75&bboxSR=4326&imageSR=4326&size=1024,1024&format=jpg&f=image";
      texLoader.load(
        LIVE_SATELLITE_URL,
        (liveTex) => {
          liveTex.wrapS = THREE.ClampToEdgeWrapping;
          liveTex.wrapT = THREE.ClampToEdgeWrapping;
          if (sceneRef.current) {
            sceneRef.current.satTex = liveTex;
            if (sceneRef.current.terrainMesh && mode === "satellite") {
              sceneRef.current.terrainMesh.material.map = liveTex;
              sceneRef.current.terrainMesh.material.needsUpdate = true;
            }
          }
        },
        undefined,
        () => {
          // Seamlessly retain local high-res satellite texture if remote network is slow
        }
      );
    }

    const initialTex = mode === "satellite" ? satTex : offlineTex;

    const terrainMaterial = new THREE.MeshStandardMaterial({
      map: initialTex,
      roughness: 0.85,
      metalness: 0.05,
      flatShading: false,
      side: THREE.DoubleSide,
    });
    const terrainMesh = new THREE.Mesh(geometry, terrainMaterial);
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    // 3D Pine Tree Clusters in Valley Floors
    if (treePositions.length > 0) {
      const treeGroup = new THREE.Group();
      const trunkGeom = new THREE.CylinderGeometry(0.7, 1.1, 5, 5);
      const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2d1f15, roughness: 0.9 });
      const foliageGeom = new THREE.ConeGeometry(4, 11, 5);
      const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1e4620, roughness: 0.8 });

      treePositions.slice(0, 180).forEach((tp) => {
        const tree = new THREE.Group();
        const trunk = new THREE.Mesh(trunkGeom, trunkMat);
        trunk.position.y = 2.5;
        const foliage = new THREE.Mesh(foliageGeom, foliageMat);
        foliage.position.y = 9;
        tree.add(trunk);
        tree.add(foliage);

        tree.position.set(tp.x, tp.y, tp.z);
        tree.scale.set(tp.scale, tp.scale, tp.scale);
        treeGroup.add(tree);
      });
      scene.add(treeGroup);
    }

    // Interactive Station Markers & Floating Billboards
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    const markerMeshes = [];
    const beaconRays = [];

    heightmap.site_markers.forEach((marker) => {
      const u = marker.grid_x / (gridSize - 1);
      const v = marker.grid_y / (gridSize - 1);
      const x = (u - 0.5) * planeSize;
      const z = (v - 0.5) * planeSize;
      const y = (marker.elevation_m - 2000) * 0.14 + 14;

      const siteData = sites[marker.location_id];
      const stability = siteData?.prediction?.physics_output?.stability_state || "UNKNOWN";
      const colorHex = STATE_HEX[stability] || STATE_HEX.UNKNOWN;
      const colorStr = STATE_COLORS[stability] || STATE_COLORS.UNKNOWN;
      const siteName = siteData?.current_params?.name || marker.name;

      // Marker Sphere
      const sphereGeom = new THREE.SphereGeometry(11, 16, 16);
      const sphereMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.3, metalness: 0.2 });
      const sphere = new THREE.Mesh(sphereGeom, sphereMat);
      sphere.position.set(x, y, z);
      sphere.userData.locationId = marker.location_id;
      scene.add(sphere);
      markerMeshes.push(sphere);

      // Vertical Beacon Light Beam
      const rayGeom = new THREE.CylinderGeometry(1.5, 3.5, 110, 8);
      const rayMat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.4 });
      const ray = new THREE.Mesh(rayGeom, rayMat);
      ray.position.set(x, y + 55, z);
      scene.add(ray);
      beaconRays.push(ray);

      // Ground Pulsing Ring
      const ringGeom = new THREE.RingGeometry(13, 18, 24);
      ringGeom.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
      const ring = new THREE.Mesh(ringGeom, ringMat);
      ring.position.set(x, y - 8, z);
      scene.add(ring);

      // Floating 3D Station Label Billboard
      const billboard = createStationBillboard(siteName, marker.location_id, colorStr);
      billboard.position.set(x, y + 32, z);
      scene.add(billboard);
    });

    function onClick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(markerMeshes);
      if (intersects.length > 0) {
        setSelectedSite(intersects[0].object.userData.locationId);
      }
    }
    renderer.domElement.addEventListener("click", onClick);

    // Orbit Drag & Zoom
    let isDragging = false;
    let prevX = 0, prevY = 0;
    let theta = Math.atan2(camera.position.x, camera.position.z);
    let phi = Math.acos(camera.position.y / camera.position.length());
    let radius = camera.position.length();

    function onMouseDown(e) { isDragging = true; prevX = e.clientX; prevY = e.clientY; }
    function onMouseUp() { isDragging = false; }
    function onMouseMove(e) {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      theta -= dx * 0.005;
      phi = Math.max(0.18, Math.min(1.42, phi - dy * 0.005));
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.lookAt(0, 0, 0);
      prevX = e.clientX; prevY = e.clientY;
    }
    function onWheel(e) {
      e.preventDefault();
      radius = Math.max(250, Math.min(1400, radius + e.deltaY * 0.5));
      camera.position.x = radius * Math.sin(phi) * Math.sin(theta);
      camera.position.z = radius * Math.sin(phi) * Math.cos(theta);
      camera.position.y = radius * Math.cos(phi);
      camera.lookAt(0, 0, 0);
    }

    renderer.domElement.addEventListener("mousedown", onMouseDown);
    renderer.domElement.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("mouseup", onMouseUp);
    window.addEventListener("mousemove", onMouseMove);

    let frameId;
    let clock = new THREE.Clock();
    function animate() {
      frameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();
      beaconRays.forEach((ray, i) => {
        ray.material.opacity = 0.3 + Math.sin(elapsedTime * 3 + i) * 0.15;
      });
      renderer.render(scene, camera);
    }
    animate();

    sceneRef.current = { renderer, scene, terrainMesh, satTex, offlineTex };

    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("click", onClick);
      renderer.domElement.removeEventListener("mousedown", onMouseDown);
      renderer.domElement.removeEventListener("wheel", onWheel);
      window.removeEventListener("mouseup", onMouseUp);
      window.removeEventListener("mousemove", onMouseMove);
      renderer.dispose();
      mount.innerHTML = "";
    };
  }, [heightmap, sites, setSelectedSite]);

  if (loading || !heightmap) {
    return <div className="empty-state">Loading terrain…</div>;
  }

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      {/* Clean Status Pill */}
      <div className="terrain-status-pill">
        <span
          className="terrain-status-dot"
          style={{ background: mode === "satellite" ? "#22c55e" : "#eab308" }}
        />
        <span>
          {mode === "satellite"
            ? (isOnline ? "🛰️ Live Satellite Terrain" : "🛰️ Satellite Terrain (Cached)")
            : "🌱 3D Terrain Model (Offline)"}
        </span>
      </div>

      {/* Clean Toggle Controls */}
      <div className="terrain-view-toggle">
        <button
          className={`terrain-toggle-btn ${mode === "satellite" ? "active" : ""}`}
          onClick={() => setMode("satellite")}
        >
          🛰️ Satellite View
        </button>
        <button
          className={`terrain-toggle-btn ${mode === "offline" ? "active" : ""}`}
          onClick={() => setMode("offline")}
        >
          🌱 Realistic Landscape
        </button>
      </div>

      <div ref={mountRef} style={{ height: "100%", width: "100%", cursor: "grab" }} />
    </div>
  );
}
