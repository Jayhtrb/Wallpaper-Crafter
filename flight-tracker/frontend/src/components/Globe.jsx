import { useEffect, useRef } from "react";
import * as THREE from "three";

// Approximate lat/lon for the destinations in destinations.js — enough for a
// visual globe, not surveying-grade. Kept alongside the component since it's
// purely a rendering concern; the backend doesn't need coordinates.
const COORDS = {
  DXB: [25.27, 55.3], AUH: [24.45, 54.38], DOH: [25.29, 51.53], MCT: [23.59, 58.28],
  KWI: [29.38, 47.98], BAH: [26.07, 50.55], JED: [21.49, 39.19], RUH: [24.71, 46.68],
  SIN: [1.35, 103.82], BKK: [13.76, 100.5], KUL: [3.14, 101.69], DPS: [-8.65, 115.22],
  CXR: [12.24, 109.19], HAN: [21.03, 105.85], MNL: [14.6, 120.98],
  LHR: [51.51, -0.13], CDG: [48.86, 2.35], FRA: [50.11, 8.68], IST: [41.01, 28.96],
  AMS: [52.37, 4.9], ZRH: [47.38, 8.54], FCO: [41.9, 12.5], MAD: [40.42, -3.7],
  JFK: [40.71, -74.01], EWR: [40.74, -74.17], ORD: [41.88, -87.63], YYZ: [43.65, -79.38],
  HKG: [22.32, 114.17], ICN: [37.57, 126.98], NRT: [35.68, 139.77], PVG: [31.23, 121.47],
  MEL: [-37.81, 144.96], SYD: [-33.87, 151.21],
};

function latLonToVector3(lat, lon, radius) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lon + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta)
  );
}

/**
 * Destinations light up green (cheap) or red (expensive) relative to the
 * cheapest tile currently on the board. `tiles` is the same map shape
 * produced by useLiveBigBoard() — { [destinationCode]: { price: { inr } } }.
 */
export default function Globe({ tiles = {}, onSelectDestination }) {
  const mountRef = useRef(null);
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
    camera.position.z = 6.5;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const globeGroup = new THREE.Group();
    scene.add(globeGroup);

    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(2.4, 48, 48),
      new THREE.MeshBasicMaterial({ color: 0x0f2540, wireframe: true, transparent: true, opacity: 0.35 })
    );
    globeGroup.add(sphere);

    const markerGeometry = new THREE.SphereGeometry(0.045, 8, 8);
    const markers = Object.entries(COORDS).map(([code, [lat, lon]]) => {
      const material = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const marker = new THREE.Mesh(markerGeometry, material);
      marker.position.copy(latLonToVector3(lat, lon, 2.45));
      marker.userData.code = code;
      globeGroup.add(marker);
      return marker;
    });

    let frameId;
    function animate() {
      globeGroup.rotation.y += 0.0025;

      const currentTiles = tilesRef.current;
      const prices = Object.values(currentTiles)
        .map((t) => t.price?.inr)
        .filter(Boolean);
      const min = prices.length ? Math.min(...prices) : null;
      const max = prices.length ? Math.max(...prices) : null;

      for (const marker of markers) {
        const tile = currentTiles[marker.userData.code];
        if (!tile?.price?.inr || min === null || max === min) {
          marker.material.color.setHex(0x475569); // no data yet — neutral gray
          continue;
        }
        const t = (tile.price.inr - min) / (max - min); // 0 = cheapest, 1 = priciest
        // green (cheap) -> red (expensive)
        const color = new THREE.Color().setHSL((1 - t) * 0.33, 0.75, 0.5);
        marker.material.color.copy(color);
      }

      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    animate();

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    function handleClick(event) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hits = raycaster.intersectObjects(markers);
      if (hits[0]) onSelectDestination?.(hits[0].object.userData.code);
    }
    renderer.domElement.addEventListener("click", handleClick);

    function handleResize() {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener("resize", handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleResize);
      renderer.domElement.removeEventListener("click", handleClick);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [onSelectDestination]);

  return <div ref={mountRef} className="h-72 w-full sm:h-96" />;
}
