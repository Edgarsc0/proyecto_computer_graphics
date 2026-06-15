"use client";

import React, { useState, useEffect, useRef } from "react";
import { 
  Map, 
  MapPin, 
  Layers, 
  Compass, 
  Plus, 
  Trash2, 
  Sun, 
  Moon, 
  RefreshCw, 
  HelpCircle,
  MousePointer,
  CheckCircle,
  AlertTriangle,
  Move,
  ZoomIn,
  ZoomOut,
  Maximize,
  ChevronLeft,
  ChevronRight,
  Copy,
  Check,
  Globe,
  Crosshair
} from "lucide-react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Geodetic limits of the campus (WGS84)
const LAT_MAX = 19.506085642577684;
const LAT_MIN = 19.501672871991357;
const LON_MAX = -99.14538442387669;
const LON_MIN = -99.14882990272824;

const DELTA_LAT = LAT_MAX - LAT_MIN;
const DELTA_LON = LON_MAX - LON_MIN;
const LAT_0 = (LAT_MAX + LAT_MIN) / 2;
// Constant latitude in radians for scale factor calculation
const LAT_0_RAD = (LAT_0 * Math.PI) / 180;

// Canvas dimension constants
const W = 1000;
// Dynamic calculation of H to preserve metric aspect ratio (isotropy)
const H = W * (DELTA_LAT / (DELTA_LON * Math.cos(LAT_0_RAD))); // ~1358.7077

// Linear transformation T(lon, lat) -> (x, y)
const toX = (lon) => {
  return (lon - LON_MIN) * (W / DELTA_LON);
};

const toY = (lat) => {
  return (LAT_MAX - lat) * (H / DELTA_LAT);
};

// Inverse linear transformation T^-1(x, y) -> (lon, lat)
const toLon = (x) => {
  return LON_MIN + (x * DELTA_LON) / W;
};

const toLat = (y) => {
  return LAT_MAX - (y * DELTA_LAT) / H;
};

// Haversine formula to compute metric distances on sphere surface (meters)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371000; // Earth's mean radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

// Static initial dataset base polygons
const initialBuildingsBase = [
  {
    id: "edificio-1",
    name: "Edificio 1 (Principal)",
    color: "#5c7cfa",
    strokeColor: "#364fc7",
    strokeWidth: 2,
    pointsStr: "387.25,556.19 461.4,396.41 517.64,423.27 503.04,452.85 483.58,444.29 422.04,573.99"
  },
  {
    id: "edificio-2",
    name: "Edificio 2 (Biblioteca)",
    color: "#ff922b",
    strokeColor: "#d9480f",
    strokeWidth: 2,
    pointsStr: "464.69,389.27 540.4,230.07 573.48,246.23 505.86,397.52"
  },
  {
    id: "edificio-3",
    name: "Edificio 3 (Laboratorios)",
    color: "#51cf66",
    strokeColor: "#2b8a3e",
    strokeWidth: 2,
    pointsStr: "490.26,539.61 562.71,389.7 626.25,420.04 557.0,570.66"
  },
  {
    id: "puente",
    name: "Puente Peatonal",
    color: "#fcc419",
    strokeColor: "#e67e22",
    strokeWidth: 1.5,
    pointsStr: "544.26,427.5 501.45,406.29 505.73,397.72 549.13,418.16"
  }
];

// Presets for easy building creation
const newBuildingPresets = {
  triangulo: `19.5050, -99.1472
19.5048, -99.1465
19.5042, -99.1470`,
  rectangulo: `19.5035, -99.1480
19.5038, -99.1475
19.5032, -99.1470
19.5029, -99.1475`,
  pentagono: `19.5028, -99.1460
19.5032, -99.1456
19.5030, -99.1450
19.5025, -99.1451
19.5024, -99.1457`
};

export default function Home() {
  // --- React State ---
  const [buildings, setBuildings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [userMarker, setUserMarker] = useState(null); // [lat, lon]
  const [selectedVertex, setSelectedVertex] = useState(null); // { edificioId, index, lat, lon, x, y }
  const [selectedBuildingId, setSelectedBuildingId] = useState(null);
  
  // UI inputs state
  const [theme, setTheme] = useState("dark");
  const [mouseCoords, setMouseCoords] = useState(null);
  const [activeTab, setActiveTab] = useState("inspector"); // "inspector" | "gps" | "crear"
  
  // GPS Simulator input
  const [gpsLat, setGpsLat] = useState("");
  const [gpsLon, setGpsLon] = useState("");
  const [gpsFeedback, setGpsFeedback] = useState(null); // { type, message }
  const [isTrackingLive, setIsTrackingLive] = useState(false);
  const gpsWatchIdRef = useRef(null);

  // New building form
  const [newBuildingName, setNewBuildingName] = useState("");
  const [newBuildingColor, setNewBuildingColor] = useState("#818cf8");
  const [newBuildingVertices, setNewBuildingVertices] = useState("");
  const [injectionFeedback, setInjectionFeedback] = useState(null); // { type, message }

  // Selected building fields edits
  const [editLat, setEditLat] = useState("");
  const [editLon, setEditLon] = useState("");
  const [copiedType, setCopiedType] = useState(null);

  // Zoom & Pan states
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [startPan, setStartPan] = useState({ x: 0, y: 0 });
  const [hasDragged, setHasDragged] = useState(false);
  const [draggedVertex, setDraggedVertex] = useState(null); // { edificioId, index }

  const svgRef = useRef(null);
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);

  const touchStartRef = useRef(null);
  const touchStartDistRef = useRef(null);
  const touchStartZoomRef = useRef(null);
  const lastTouchTimeRef = useRef(0);

  useEffect(() => {
    zoomRef.current = zoom;
    panRef.current = pan;
  }, [zoom, pan]);

  // Bind mouse wheel Zoom non-passive event listener once
  useEffect(() => {
    const svgElement = svgRef.current;
    if (!svgElement) return;

    const onWheelListener = (e) => {
      e.preventDefault();
      const zoomFactor = 1.15;
      const currentZoom = zoomRef.current;
      const currentPan = panRef.current;
      
      let nextZoom;
      if (e.deltaY < 0) {
        nextZoom = Math.min(10, currentZoom * zoomFactor);
      } else {
        nextZoom = Math.max(0.4, currentZoom / zoomFactor);
      }
      
      const rect = svgElement.getBoundingClientRect();
      const svgX = ((e.clientX - rect.left) / rect.width) * W;
      const svgY = ((e.clientY - rect.top) / rect.height) * H;
      
      const newPanX = svgX - (svgX - currentPan.x) * (nextZoom / currentZoom);
      const newPanY = svgY - (svgY - currentPan.y) * (nextZoom / currentZoom);
      
      setZoom(nextZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    svgElement.addEventListener("wheel", onWheelListener, { passive: false });
    return () => {
      svgElement.removeEventListener("wheel", onWheelListener);
    };
  }, []);

  // --- Initial Mount / Hydration ---
  useEffect(() => {
    // Determine user preference theme
    const savedTheme = localStorage.getItem("theme");
    const darkThemePreferred = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initialTheme = savedTheme || (darkThemePreferred ? "dark" : "light");
    setTheme(initialTheme);
    document.documentElement.className = initialTheme;

    // Load initial dataset from backend API, fallback to static defaults if server is offline
    const loadData = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE_URL}/api/buildings/`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.length > 0) {
            // Hydrate svgPoints for each building using coordinates
            const hydrated = data.map(b => ({
              ...b,
              svgPoints: b.rawCoordinates.map(([lat, lon]) => `${toX(lon).toFixed(2)},${toY(lat).toFixed(2)}`).join(" ")
            }));
            setBuildings(hydrated);
            setIsLoading(false);
            return;
          }
        }
      } catch (err) {
        console.error("Error connecting to local database API. Using offline backup.", err);
      }

      // Fallback: Static dataset
      const parsed = initialBuildingsBase.map(b => {
        const coords = b.pointsStr.trim().split(/\s+/).map(pair => {
          const [xStr, yStr] = pair.split(",");
          const x = parseFloat(xStr);
          const y = parseFloat(yStr);
          return [toLat(y), toLon(x)];
        });
        return {
          id: b.id,
          name: b.name,
          color: b.color,
          strokeColor: b.strokeColor,
          strokeWidth: b.strokeWidth,
          rawCoordinates: coords,
          svgPoints: b.pointsStr
        };
      });
      setBuildings(parsed);
      setIsLoading(false);
    };

    loadData();
  }, []);

  // Sync theme to DOM
  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem("theme", nextTheme);
    document.documentElement.className = nextTheme;
  };

  // Reset to default buildings (backend + local fallback)
  const handleResetDefault = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/buildings/reset_defaults/`, {
        method: "POST"
      });
      if (res.ok) {
        const data = await res.json();
        const hydrated = data.map(b => ({
          ...b,
          svgPoints: b.rawCoordinates.map(([lat, lon]) => `${toX(lon).toFixed(2)},${toY(lat).toFixed(2)}`).join(" ")
        }));
        setBuildings(hydrated);
        setSelectedVertex(null);
        setSelectedBuildingId(null);
        setInjectionFeedback({ type: "info", message: "Dataset inicial restablecido en base de datos." });
        setTimeout(() => setInjectionFeedback(null), 3000);
        return;
      }
    } catch (err) {
      console.error("Error resetting database defaults:", err);
    }

    // Local Fallback
    const parsed = initialBuildingsBase.map(b => {
      const coords = b.pointsStr.trim().split(/\s+/).map(pair => {
        const [xStr, yStr] = pair.split(",");
        const x = parseFloat(xStr);
        const y = parseFloat(yStr);
        return [toLat(y), toLon(x)];
      });
      return {
        id: b.id,
        name: b.name,
        color: b.color,
        strokeColor: b.strokeColor,
        strokeWidth: b.strokeWidth,
        rawCoordinates: coords,
        svgPoints: b.pointsStr
      };
    });
    setBuildings(parsed);
    setSelectedVertex(null);
    setSelectedBuildingId(null);
    setInjectionFeedback({ type: "info", message: "Dataset inicial local restablecido (Servidor desconectado)." });
    setTimeout(() => setInjectionFeedback(null), 3000);
  };

  // --- Map Helper Utilities ---
  // Recalculates the SVG string of points from a geodetic coords array
  const generateSvgPointsStr = (coords) => {
    return coords.map(([lat, lon]) => `${toX(lon).toFixed(2)},${toY(lat).toFixed(2)}`).join(" ");
  };

  // Calculates the perimeter of a building polygon in meters
  const getPerimeter = (coords) => {
    if (!coords || coords.length < 2) return 0;
    let perimeter = 0;
    for (let i = 0; i < coords.length; i++) {
      const current = coords[i];
      const next = coords[(i + 1) % coords.length];
      perimeter += calculateDistance(current[0], current[1], next[0], next[1]);
    }
    return perimeter;
  };

  // Calculates polygon centroid (for labels and visual effects)
  const getCentroid = (coords) => {
    if (!coords || coords.length === 0) return { x: 500, y: 500 };
    let sumX = 0;
    let sumY = 0;
    coords.forEach(([lat, lon]) => {
      sumX += toX(lon);
      sumY += toY(lat);
    });
    return {
      x: sumX / coords.length,
      y: sumY / coords.length
    };
  };

  // --- Handlers & Interactivity ---
  // Helper to calculate local geodetic coords, taking zoom & pan into account
  const getLocalCoords = (clientX, clientY) => {
    if (!svgRef.current) return null;
    const svg = svgRef.current;
    const gElement = svg.querySelector("g");
    if (!gElement) return null;

    try {
      const pt = svg.createSVGPoint();
      pt.x = clientX;
      pt.y = clientY;
      
      const ctm = gElement.getScreenCTM();
      if (!ctm) return null;
      
      const transformed = pt.matrixTransform(ctm.inverse());
      const x = transformed.x;
      const y = transformed.y;
      const lon = toLon(x);
      const lat = toLat(y);
      return { x, y, lat, lon };
    } catch (err) {
      console.error("Error calculating local coordinates:", err);
      // Fallback in case of browser/rendering exceptions
      const rect = svg.getBoundingClientRect();
      const svgX = ((clientX - rect.left) / rect.width) * W;
      const svgY = ((clientY - rect.top) / rect.height) * H;
      const x = (svgX - pan.x) / zoom;
      const y = (svgY - pan.y) / zoom;
      const lon = toLon(x);
      const lat = toLat(y);
      return { x, y, lat, lon };
    }
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      // Check for double tap
      const now = Date.now();
      const DOUBLE_TAP_DELAY = 300;
      if (now - lastTouchTimeRef.current < DOUBLE_TAP_DELAY) {
        // Double tap! Zoom in on the touch point
        const touch = e.touches[0];
        const rect = svgRef.current.getBoundingClientRect();
        const svgX = ((touch.clientX - rect.left) / rect.width) * W;
        const svgY = ((touch.clientY - rect.top) / rect.height) * H;
        
        const currentZoom = zoomRef.current;
        const currentPan = panRef.current;
        const nextZoom = Math.min(10, currentZoom * 1.5);
        
        const newPanX = svgX - (svgX - currentPan.x) * (nextZoom / currentZoom);
        const newPanY = svgY - (svgY - currentPan.y) * (nextZoom / currentZoom);
        
        setZoom(nextZoom);
        setPan({ x: newPanX, y: newPanY });
        
        lastTouchTimeRef.current = 0; // reset
        return;
      }
      lastTouchTimeRef.current = now;

      // Single touch drag map
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({ x: touch.clientX, y: touch.clientY });
      setStartPan({ ...panRef.current });
      setHasDragged(false);
    } else if (e.touches.length === 2) {
      // Two touches: pinch-to-zoom
      setIsDragging(false);
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      touchStartDistRef.current = dist;
      touchStartZoomRef.current = zoomRef.current;
      
      const rect = svgRef.current.getBoundingClientRect();
      const midClientX = (t1.clientX + t2.clientX) / 2;
      const midClientY = (t1.clientY + t2.clientY) / 2;
      const svgX = ((midClientX - rect.left) / rect.width) * W;
      const svgY = ((midClientY - rect.top) / rect.height) * H;
      touchStartRef.current = {
        midX: svgX,
        midY: svgY,
        panX: panRef.current.x,
        panY: panRef.current.y
      };
    }
  };

  const handleTouchMove = (e) => {
    if (draggedVertex) {
      const touch = e.touches[0];
      const coords = getLocalCoords(touch.clientX, touch.clientY);
      if (!coords) return;

      const updated = buildings.map(b => {
        if (b.id === draggedVertex.edificioId) {
          const newCoords = [...b.rawCoordinates];
          newCoords[draggedVertex.index] = [coords.lat, coords.lon];
          return {
            ...b,
            rawCoordinates: newCoords,
            svgPoints: generateSvgPointsStr(newCoords)
          };
        }
        return b;
      });

      setBuildings(updated);
      
      setSelectedVertex({
        edificioId: draggedVertex.edificioId,
        index: draggedVertex.index,
        lat: coords.lat,
        lon: coords.lon,
        x: toX(coords.lon),
        y: toY(coords.lat)
      });
      setEditLat(coords.lat.toFixed(8));
      setEditLon(coords.lon.toFixed(8));
      return;
    }

    if (e.touches.length === 1 && isDragging) {
      const touch = e.touches[0];
      const dx = touch.clientX - dragStart.x;
      const dy = touch.clientY - dragStart.y;

      if (Math.hypot(dx, dy) > 3) {
        setHasDragged(true);
      }

      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgDx = (dx / rect.width) * W;
      const svgDy = (dy / rect.height) * H;

      setPan({
        x: startPan.x + svgDx,
        y: startPan.y + svgDy
      });
    } else if (e.touches.length === 2 && touchStartDistRef.current && touchStartRef.current) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const startDist = touchStartDistRef.current;
      
      if (startDist > 0) {
        const scale = currentDist / startDist;
        const initialZoom = touchStartZoomRef.current;
        const nextZoom = Math.max(0.4, Math.min(10, initialZoom * scale));
        
        const { midX, midY, panX, panY } = touchStartRef.current;
        
        const newPanX = midX - (midX - panX) * (nextZoom / initialZoom);
        const newPanY = midY - (midY - panY) * (nextZoom / initialZoom);
        
        setZoom(nextZoom);
        setPan({ x: newPanX, y: newPanY });
      }
    }
  };

  const handleTouchEnd = async (e) => {
    if (draggedVertex) {
      const bId = draggedVertex.edificioId;
      const b = buildings.find(x => x.id === bId);
      if (b) {
        try {
          await fetch(`${API_BASE_URL}/api/buildings/${b.id}/`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              id: b.id,
              name: b.name,
              color: b.color,
              strokeColor: b.strokeColor,
              strokeWidth: b.strokeWidth,
              rawCoordinates: b.rawCoordinates
            })
          });
        } catch (err) {
          console.error("Error saving dragged building to DB:", err);
        }
      }
      setDraggedVertex(null);
    }

    setIsDragging(false);
    touchStartDistRef.current = null;
    touchStartRef.current = null;
  };

  const handleVertexTouchStart = (e, buildingId, index, lat, lon) => {
    e.stopPropagation();
    setDraggedVertex({ edificioId: buildingId, index });
    setSelectedBuildingId(buildingId);
    setSelectedVertex({
      edificioId: buildingId,
      index,
      lat,
      lon,
      x: toX(lon),
      y: toY(lat)
    });
    setEditLat(lat.toFixed(8));
    setEditLon(lon.toFixed(8));
  };

  const handleMouseDown = (e) => {
    if (e.button !== 0) return; // Left click drag only
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    setStartPan({ ...pan });
    setHasDragged(false);
  };

  const handleMouseUp = async (e) => {
    setIsDragging(false);
    
    // Save dragged vertex to DB when drag ends
    if (draggedVertex) {
      const bId = draggedVertex.edificioId;
      const b = buildings.find(x => x.id === bId);
      if (b) {
        try {
          await fetch(`${API_BASE_URL}/api/buildings/${b.id}/`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              id: b.id,
              name: b.name,
              color: b.color,
              strokeColor: b.strokeColor,
              strokeWidth: b.strokeWidth,
              rawCoordinates: b.rawCoordinates
            })
          });
        } catch (err) {
          console.error("Error saving dragged building to DB:", err);
        }
      }
    }
    
    setDraggedVertex(null);
  };

  const handleSvgClick = (e) => {
    if (hasDragged) return; // Ignore if user was panning/dragging map
    setSelectedVertex(null);
    setSelectedBuildingId(null);
  };

  const handleZoomIn = () => {
    setZoom(z => {
      const next = Math.min(10, z * 1.3);
      setPan(p => ({
        x: W / 2 - (W / 2 - p.x) * (next / z),
        y: H / 2 - (H / 2 - p.y) * (next / z)
      }));
      return next;
    });
  };

  const handleZoomOut = () => {
    setZoom(z => {
      const next = Math.max(0.4, z / 1.3);
      setPan(p => ({
        x: W / 2 - (W / 2 - p.x) * (next / z),
        y: H / 2 - (H / 2 - p.y) * (next / z)
      }));
      return next;
    });
  };

  const handleZoomReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  const handleVertexMouseDown = (e, buildingId, index, lat, lon) => {
    e.stopPropagation();
    e.preventDefault();
    setDraggedVertex({ edificioId: buildingId, index });
    setSelectedBuildingId(buildingId);
    setSelectedVertex({
      edificioId: buildingId,
      index,
      lat,
      lon,
      x: toX(lon),
      y: toY(lat)
    });
    setEditLat(lat.toFixed(8));
    setEditLon(lon.toFixed(8));
  };

  // Dynamic coordinate inspector, dragging map or dragging vertex handler
  const handleMouseMove = (e) => {
    // 1. Handle vertex dragging in real-time
    if (draggedVertex) {
      const coords = getLocalCoords(e.clientX, e.clientY);
      if (!coords) return;

      const updated = buildings.map(b => {
        if (b.id === draggedVertex.edificioId) {
          const newCoords = [...b.rawCoordinates];
          newCoords[draggedVertex.index] = [coords.lat, coords.lon];
          return {
            ...b,
            rawCoordinates: newCoords,
            svgPoints: generateSvgPointsStr(newCoords)
          };
        }
        return b;
      });

      setBuildings(updated);
      
      // Keep inputs sync in real-time
      setSelectedVertex({
        edificioId: draggedVertex.edificioId,
        index: draggedVertex.index,
        lat: coords.lat,
        lon: coords.lon,
        x: toX(coords.lon),
        y: toY(coords.lat)
      });
      setEditLat(coords.lat.toFixed(8));
      setEditLon(coords.lon.toFixed(8));

      // Update cursor coordinate overlay
      setMouseCoords({
        x: coords.x.toFixed(1),
        y: coords.y.toFixed(1),
        lat: coords.lat.toFixed(6),
        lon: coords.lon.toFixed(6)
      });
      return;
    }

    // 2. Normal hover and map dragging
    const coords = getLocalCoords(e.clientX, e.clientY);
    if (coords) {
      setMouseCoords({
        x: coords.x.toFixed(1),
        y: coords.y.toFixed(1),
        lat: coords.lat.toFixed(6),
        lon: coords.lon.toFixed(6)
      });
    }

    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;

      if (Math.hypot(dx, dy) > 3) {
        setHasDragged(true);
      }

      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const svgDx = (dx / rect.width) * W;
      const svgDy = (dy / rect.height) * H;

      setPan({
        x: startPan.x + svgDx,
        y: startPan.y + svgDy
      });
    }
  };

  const handleMouseLeave = () => {
    setMouseCoords(null);
    setIsDragging(false);
    setDraggedVertex(null);
  };

  // Polygon click selector (selects closest vertex of clicked building)
  const handleBuildingClick = (e, building, clickEvent) => {
    clickEvent.stopPropagation();
    if (hasDragged) return; // Prevent selection if dragging occurred
    setSelectedBuildingId(building.id);
    
    // Find closest vertex to the click event in local coordinates
    const coords = getLocalCoords(clickEvent.clientX, clickEvent.clientY);
    if (!coords) return;
    const localX = coords.x;
    const localY = coords.y;

    let minDistance = Infinity;
    let closestIndex = 0;

    building.rawCoordinates.forEach(([lat, lon], idx) => {
      const vx = toX(lon);
      const vy = toY(lat);
      const dist = Math.hypot(localX - vx, localY - vy);
      if (dist < minDistance) {
        minDistance = dist;
        closestIndex = idx;
      }
    });

    const activeVertex = building.rawCoordinates[closestIndex];
    const newSel = {
      edificioId: building.id,
      index: closestIndex,
      lat: activeVertex[0],
      lon: activeVertex[1],
      x: toX(activeVertex[1]),
      y: toY(activeVertex[0])
    };
    
    setSelectedVertex(newSel);
    setEditLat(activeVertex[0].toFixed(8));
    setEditLon(activeVertex[1].toFixed(8));
  };

  // Specific Vertex Marker Click Selector
  const handleVertexClick = (e, buildingId, index, lat, lon) => {
    e.stopPropagation();
    if (hasDragged) return; // Prevent selection if dragging occurred
    setSelectedBuildingId(buildingId);
    setSelectedVertex({
      edificioId: buildingId,
      index,
      lat,
      lon,
      x: toX(lon),
      y: toY(lat)
    });
    setEditLat(lat.toFixed(8));
    setEditLon(lon.toFixed(8));
  };

  // Save changes to selected vertex
  const handleSaveVertexEdit = async (e) => {
    e.preventDefault();
    if (!selectedVertex) return;

    const latVal = parseFloat(editLat);
    const lonVal = parseFloat(editLon);

    if (isNaN(latVal) || isNaN(lonVal)) {
      alert("Coordenadas no válidas. Ingrese valores numéricos.");
      return;
    }

    let updatedBuilding = null;
    const updated = buildings.map(b => {
      if (b.id === selectedVertex.edificioId) {
        const newCoords = [...b.rawCoordinates];
        newCoords[selectedVertex.index] = [latVal, lonVal];
        updatedBuilding = {
          ...b,
          rawCoordinates: newCoords,
          svgPoints: generateSvgPointsStr(newCoords)
        };
        return updatedBuilding;
      }
      return b;
    });

    setBuildings(updated);
    
    // Update the selected vertex details
    setSelectedVertex({
      ...selectedVertex,
      lat: latVal,
      lon: lonVal,
      x: toX(lonVal),
      y: toY(latVal)
    });

    if (updatedBuilding) {
      try {
        await fetch(`${API_BASE_URL}/api/buildings/${updatedBuilding.id}/`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: updatedBuilding.id,
            name: updatedBuilding.name,
            color: updatedBuilding.color,
            strokeColor: updatedBuilding.strokeColor,
            strokeWidth: updatedBuilding.strokeWidth,
            rawCoordinates: updatedBuilding.rawCoordinates
          })
        });
      } catch (err) {
        console.error("Error saving vertex edit to DB:", err);
      }
    }
  };

  // Delete active building
  const handleDeleteBuilding = async (id) => {
    const updated = buildings.filter(b => b.id !== id);
    setBuildings(updated);
    if (selectedBuildingId === id) {
      setSelectedBuildingId(null);
      setSelectedVertex(null);
    }

    try {
      await fetch(`${API_BASE_URL}/api/buildings/${id}/`, {
        method: "DELETE"
      });
    } catch (err) {
      console.error("Error deleting building from DB:", err);
    }
  };

  // Navigate to next vertex of selected structure (CAD style)
  const handleNextVertex = () => {
    if (!selectedVertex || !activeBuilding) return;
    const len = activeBuilding.rawCoordinates.length;
    const nextIdx = (selectedVertex.index + 1) % len;
    const nextCoord = activeBuilding.rawCoordinates[nextIdx];
    setSelectedVertex({
      edificioId: activeBuilding.id,
      index: nextIdx,
      lat: nextCoord[0],
      lon: nextCoord[1],
      x: toX(nextCoord[1]),
      y: toY(nextCoord[0])
    });
    setEditLat(nextCoord[0].toFixed(8));
    setEditLon(nextCoord[1].toFixed(8));
  };

  // Navigate to previous vertex of selected structure (CAD style)
  const handlePrevVertex = () => {
    if (!selectedVertex || !activeBuilding) return;
    const len = activeBuilding.rawCoordinates.length;
    const prevIdx = (selectedVertex.index - 1 + len) % len;
    const prevCoord = activeBuilding.rawCoordinates[prevIdx];
    setSelectedVertex({
      edificioId: activeBuilding.id,
      index: prevIdx,
      lat: prevCoord[0],
      lon: prevCoord[1],
      x: toX(prevCoord[1]),
      y: toY(prevCoord[0])
    });
    setEditLat(prevCoord[0].toFixed(8));
    setEditLon(prevCoord[1].toFixed(8));
  };

  // Add new vertex at the geodetic midpoint between current vertex and next (CAD style)
  const handleAddVertexAfter = async () => {
    if (!selectedVertex || !activeBuilding) return;
    const coords = activeBuilding.rawCoordinates;
    const k = selectedVertex.index;
    const nextK = (k + 1) % coords.length;
    
    const midLat = (coords[k][0] + coords[nextK][0]) / 2;
    const midLon = (coords[k][1] + coords[nextK][1]) / 2;
    
    const newCoords = [...coords];
    newCoords.splice(k + 1, 0, [midLat, midLon]);
    
    const updatedBuilding = {
      ...activeBuilding,
      rawCoordinates: newCoords,
      svgPoints: generateSvgPointsStr(newCoords)
    };

    const updated = buildings.map(b => {
      if (b.id === activeBuilding.id) {
        return updatedBuilding;
      }
      return b;
    });
    
    setBuildings(updated);
    
    const newIdx = k + 1;
    setSelectedVertex({
      edificioId: activeBuilding.id,
      index: newIdx,
      lat: midLat,
      lon: midLon,
      x: toX(midLon),
      y: toY(midLat)
    });
    setEditLat(midLat.toFixed(8));
    setEditLon(midLon.toFixed(8));

    try {
      await fetch(`${API_BASE_URL}/api/buildings/${updatedBuilding.id}/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: updatedBuilding.id,
          name: updatedBuilding.name,
          color: updatedBuilding.color,
          strokeColor: updatedBuilding.strokeColor,
          strokeWidth: updatedBuilding.strokeWidth,
          rawCoordinates: updatedBuilding.rawCoordinates
        })
      });
    } catch (err) {
      console.error("Error saving added vertex to DB:", err);
    }
  };

  // Delete active vertex (CAD style)
  const handleDeleteVertex = async () => {
    if (!selectedVertex || !activeBuilding) return;
    const coords = activeBuilding.rawCoordinates;
    if (coords.length <= 3) {
      alert("No se puede eliminar el vértice. Una estructura debe tener al menos 3 vértices para conformar un polígono.");
      return;
    }
    
    const k = selectedVertex.index;
    const newCoords = coords.filter((_, idx) => idx !== k);
    
    const updatedBuilding = {
      ...activeBuilding,
      rawCoordinates: newCoords,
      svgPoints: generateSvgPointsStr(newCoords)
    };

    const updated = buildings.map(b => {
      if (b.id === activeBuilding.id) {
        return updatedBuilding;
      }
      return b;
    });
    
    setBuildings(updated);
    
    const newIdx = Math.max(0, k - 1);
    const nextCoord = newCoords[newIdx];
    setSelectedVertex({
      edificioId: activeBuilding.id,
      index: newIdx,
      lat: nextCoord[0],
      lon: nextCoord[1],
      x: toX(nextCoord[1]),
      y: toY(nextCoord[0])
    });
    setEditLat(nextCoord[0].toFixed(8));
    setEditLon(nextCoord[1].toFixed(8));

    try {
      await fetch(`${API_BASE_URL}/api/buildings/${updatedBuilding.id}/`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          id: updatedBuilding.id,
          name: updatedBuilding.name,
          color: updatedBuilding.color,
          strokeColor: updatedBuilding.strokeColor,
          strokeWidth: updatedBuilding.strokeWidth,
          rawCoordinates: updatedBuilding.rawCoordinates
        })
      });
    } catch (err) {
      console.error("Error saving deleted vertex to DB:", err);
    }
  };

  // Center the viewport on the active vertex coordinates
  const handleCenterVertex = () => {
    if (!selectedVertex) return;
    const vx = toX(selectedVertex.lon);
    const vy = toY(selectedVertex.lat);
    setPan({
      x: W / 2 - vx * zoom,
      y: H / 2 - vy * zoom
    });
  };

  // Copy coordinates value to clipboard
  const handleCopy = (val, type) => {
    navigator.clipboard.writeText(val);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 1500);
  };

  // --- Módulo A: GPS Location Simulator ---
  const handleGpsSubmit = (e) => {
    e.preventDefault();
    const latVal = parseFloat(gpsLat);
    const lonVal = parseFloat(gpsLon);

    if (isNaN(latVal) || isNaN(lonVal)) {
      setGpsFeedback({
        type: "error",
        message: "Por favor, ingrese valores de coordenadas numéricos válidos."
      });
      return;
    }

    // Process geodetic position
    setUserMarker([latVal, lonVal]);

    // Check bounds
    const isInside = 
      latVal >= LAT_MIN && 
      latVal <= LAT_MAX && 
      lonVal >= LON_MIN && 
      lonVal <= LON_MAX;

    if (isInside) {
      setGpsFeedback({
        type: "success",
        message: "Ubicación fijada con éxito dentro de los límites del campus."
      });
    } else {
      setGpsFeedback({
        type: "warning",
        message: "Aviso: Las coordenadas están fuera del límite del campus escolar, la posición puede proyectarse fuera de pantalla."
      });
    }
  };

  // Quick select preset coordinates
  const handleSetGpsPreset = (lat, lon, label) => {
    // If live tracking is active, disable it first to avoid conflicts
    if (isTrackingLive) {
      stopLiveTracking();
    }
    setGpsLat(lat.toString());
    setGpsLon(lon.toString());
    setUserMarker([lat, lon]);
    setGpsFeedback({
      type: "success",
      message: `Ubicación simulada en preset: ${label}`
    });
  };

  // Real-time device geolocator capture controllers
  const startLiveTracking = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGpsFeedback({
        type: "error",
        message: "La geolocalización no está soportada por su navegador."
      });
      return;
    }

    setIsTrackingLive(true);
    setGpsFeedback({
      type: "info",
      message: "Solicitando acceso a la ubicación GPS de su dispositivo..."
    });

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const latVal = position.coords.latitude;
        const lonVal = position.coords.longitude;

        const isInside = 
          latVal >= LAT_MIN && 
          latVal <= LAT_MAX && 
          lonVal >= LON_MIN && 
          lonVal <= LON_MAX;

        if (isInside) {
          setUserMarker([latVal, lonVal]);
          setGpsLat(latVal.toFixed(8));
          setGpsLon(lonVal.toFixed(8));
          setGpsFeedback({
            type: "success",
            message: `Ubicación GPS real en vivo: ${latVal.toFixed(6)}°N, ${lonVal.toFixed(6)}°W`
          });
        } else {
          // Immediately stop capturing if user is not in the school bounds
          navigator.geolocation.clearWatch(watchId);
          gpsWatchIdRef.current = null;
          setIsTrackingLive(false);
          setUserMarker(null);
          setGpsFeedback({
            type: "error",
            message: `Error: Te encuentras fuera del campus escolar (${latVal.toFixed(5)}°N, ${lonVal.toFixed(5)}°W). Captura automática desactivada.`
          });
        }
      },
      (error) => {
        console.error("Live Geolocation error:", error);
        navigator.geolocation.clearWatch(watchId);
        gpsWatchIdRef.current = null;
        setIsTrackingLive(false);
        
        let msg = "Error al capturar ubicación.";
        if (error.code === error.PERMISSION_DENIED) {
          msg = "Permiso de ubicación denegado por el usuario.";
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          msg = "Señal de GPS no disponible.";
        } else if (error.code === error.TIMEOUT) {
          msg = "Tiempo de espera agotado al conectar al GPS.";
        }
        setGpsFeedback({ type: "error", message: msg });
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    gpsWatchIdRef.current = watchId;
  };

  const stopLiveTracking = () => {
    if (gpsWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      gpsWatchIdRef.current = null;
    }
    setIsTrackingLive(false);
  };

  const toggleLiveGeolocation = () => {
    if (isTrackingLive) {
      stopLiveTracking();
      setGpsFeedback({
        type: "info",
        message: "Geolocalización en tiempo real desactivada."
      });
    } else {
      startLiveTracking();
    }
  };

  // Cleanup geolocation watcher on unmount
  useEffect(() => {
    return () => {
      if (gpsWatchIdRef.current !== null) {
        navigator.geolocation.clearWatch(gpsWatchIdRef.current);
      }
    };
  }, []);

  // --- Módulo C: Dynamic Building Ingestion ---
  const handleCreateBuilding = async (e) => {
    e.preventDefault();
    setInjectionFeedback(null);

    // Form inputs cleanup & sanitization
    const name = newBuildingName.trim();
    if (!name) {
      setInjectionFeedback({ type: "error", message: "Ingrese un nombre de estructura válido." });
      return;
    }

    const lines = newBuildingVertices
      .split("\n")
      .map(line => line.trim())
      .filter(line => line !== "");

    if (lines.length < 3) {
      setInjectionFeedback({ 
        type: "error", 
        message: "Se requiere un polígono de al menos 3 vértices para conformar la estructura." 
      });
      return;
    }

    try {
      const coords = lines.map((line, index) => {
        // Parse row values, splitting by comma or whitespace
        const parts = line.split(/[,\s]+/).map(p => p.trim()).filter(p => p !== "");
        if (parts.length < 2) {
          throw new Error(`Fila ${index + 1}: Formato incorrecto. Use 'Latitud, Longitud'.`);
        }
        
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        
        if (isNaN(lat) || isNaN(lon)) {
          throw new Error(`Fila ${index + 1}: Caracteres no numéricos encontrados.`);
        }

        return [lat, lon];
      });

      // Generate visual structures
      const id = `edificio-custom-${Date.now()}`;
      const strokeColor = darkenHexColor(newBuildingColor, 30);
      
      const newBuilding = {
        id,
        name,
        color: newBuildingColor,
        strokeColor,
        strokeWidth: 2,
        rawCoordinates: coords,
        svgPoints: generateSvgPointsStr(coords)
      };

      setBuildings([...buildings, newBuilding]);
      setSelectedBuildingId(id);
      
      // Auto select first vertex
      setSelectedVertex({
        edificioId: id,
        index: 0,
        lat: coords[0][0],
        lon: coords[0][1],
        x: toX(coords[0][1]),
        y: toY(coords[0][0])
      });
      setEditLat(coords[0][0].toFixed(8));
      setEditLon(coords[0][1].toFixed(8));

      // Reset form fields
      setNewBuildingName("");
      setNewBuildingVertices("");
      setInjectionFeedback({
        type: "success",
        message: `¡Estructura '${name}' inyectada y renderizada con éxito!`
      });

      // Save to DB
      try {
        await fetch(`${API_BASE_URL}/api/buildings/`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            id: newBuilding.id,
            name: newBuilding.name,
            color: newBuilding.color,
            strokeColor: newBuilding.strokeColor,
            strokeWidth: newBuilding.strokeWidth,
            rawCoordinates: newBuilding.rawCoordinates
          })
        });
      } catch (err) {
        console.error("Error creating building in DB:", err);
      }
    } catch (err) {
      setInjectionFeedback({
        type: "error",
        message: err.message || "Error al procesar las coordenadas de los vértices."
      });
    }
  };

  // Helper function to darken hex colors for building borders
  const darkenHexColor = (hex, percent) => {
    let num = parseInt(hex.replace("#",""), 16),
        amt = Math.round(2.55 * percent),
        R = (num >> 16) - amt,
        G = (num >> 8 & 0x00FF) - amt,
        B = (num & 0x0000FF) - amt;
    return "#" + (0x1000000 + (R<0?0:R>255?255:R)*0x10000 + (G<0?0:G>255?255:G)*0x100 + (B<0?0:B>255?255:B)).toString(16).slice(1);
  };

  // Load preset vertices in form textarea
  const handleLoadVerticesPreset = (type) => {
    setNewBuildingVertices(newBuildingPresets[type]);
    setInjectionFeedback({
      type: "info",
      message: `Plantilla de vértices '${type}' cargada. Presione 'Crear Estructura' para renderizar.`
    });
  };

  // --- Layout Calculations ---
  const activeBuilding = buildings.find(b => b.id === selectedBuildingId);
  const activeCentroid = activeBuilding ? getCentroid(activeBuilding.rawCoordinates) : null;

  // Grid ticks calculations (renders grid overlays on SVG dynamically)
  const gridLats = [];
  const gridLons = [];
  for (let i = 0.1; i <= 0.9; i += 0.2) {
    gridLats.push(LAT_MIN + DELTA_LAT * i);
    gridLons.push(LON_MIN + DELTA_LON * i);
  }

  return (
    <div className="dashboard-container">
      {/* Header bar */}
      <header className="dashboard-header">
        <div className="header-left">
          <Compass className="w-6 h-6 text-indigo-500 animate-spin-slow" />
          <h1 className="header-title">Proyecto Computer Graphics</h1>
        </div>
        <div className="header-right">
          <button 
            className="btn btn-secondary btn-sm"
            onClick={handleResetDefault}
            title="Restaurar mapa original"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Restablecer
          </button>
          
          <button 
            className="overlay-btn"
            style={{ width: "32px", height: "32px", borderRadius: "50%" }}
            onClick={toggleTheme}
            title={theme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="dashboard-main">
        {/* Left Side - Interactive SVG Map */}
        <section className="map-section">
          <div className="map-wrapper">
            <svg 
              ref={svgRef}
              className="map-svg"
              viewBox={`0 0 ${W} ${H.toFixed(2)}`}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              onMouseDown={handleMouseDown}
              onMouseUp={handleMouseUp}
              onClick={handleSvgClick}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{ 
                cursor: isDragging ? "grabbing" : "grab",
                touchAction: "none"
              }}
            >
              {/* Group wrapper to apply zoom and pan transforms */}
              <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                
                {/* Dynamic Coordinate Grid Overlay */}
                <g id="grid-lines">
                  {gridLons.map((lon, i) => {
                    const x = toX(lon);
                    return (
                      <g key={`lon-line-${i}`}>
                        <line 
                          x1={x} 
                          y1={0} 
                          x2={x} 
                          y2={H} 
                          className="svg-grid-line" 
                          vectorEffect="non-scaling-stroke"
                        />
                        <text 
                          x={x + 4} 
                          y={20 / zoom} 
                          className="svg-grid-text"
                          style={{ fontSize: `${10 / Math.pow(zoom, 0.6)}px` }}
                        >
                          {lon.toFixed(5)}°W
                        </text>
                      </g>
                    );
                  })}
                  {gridLats.map((lat, i) => {
                    const y = toY(lat);
                    return (
                      <g key={`lat-line-${i}`}>
                        <line 
                          x1={0} 
                          y1={y} 
                          x2={W} 
                          y2={y} 
                          className="svg-grid-line" 
                          vectorEffect="non-scaling-stroke"
                        />
                        <text 
                          x={10 / zoom} 
                          y={y - 4 / zoom} 
                          className="svg-grid-text"
                          style={{ fontSize: `${10 / Math.pow(zoom, 0.6)}px` }}
                        >
                          {lat.toFixed(5)}°N
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Background Terrain Campus Bounds */}
                <polygon 
                  points="0,1120.2 524.03,0 1000,224.36 502.68,1358.71" 
                  className="svg-bg-terrain"
                  strokeDasharray="5,5" 
                  vectorEffect="non-scaling-stroke"
                />

                {/* Buildings & Structures Polygons */}
                <g id="buildings-layer">
                  {buildings.map((building) => {
                    const isSelected = building.id === selectedBuildingId;
                    return (
                      <polygon
                        key={building.id}
                        points={building.svgPoints}
                        className={`svg-building ${isSelected ? "selected" : ""}`}
                        fill={building.color || "var(--svg-building-default)"}
                        stroke={building.strokeColor || "var(--color-accent)"}
                        strokeWidth={isSelected ? Math.max(3, building.strokeWidth * 1.5) : building.strokeWidth}
                        vectorEffect="non-scaling-stroke"
                        onClick={(e) => handleBuildingClick(e, building, e)}
                      />
                    );
                  })}
                </g>

                {/* Labels on structure centroids */}
                <g id="labels-layer">
                  {buildings.map((building) => {
                    const centroid = getCentroid(building.rawCoordinates);
                    return (
                      <text
                        key={`label-${building.id}`}
                        x={centroid.x}
                        y={centroid.y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        style={{
                          fill: theme === "dark" ? "#ffffff" : "#0f172a",
                          fontSize: `${11 / Math.pow(zoom, 0.6)}px`,
                          fontWeight: "700",
                          pointerEvents: "none",
                          textShadow: theme === "dark" 
                            ? "0 1px 3px rgba(0,0,0,0.9), 0 0 2px rgba(0,0,0,0.9)" 
                            : "0 1px 2px rgba(255,255,255,0.9), 0 0 2px rgba(255,255,255,0.9)"
                        }}
                      >
                        {building.name}
                      </text>
                    );
                  })}
                </g>

                {/* Vertices Interactive Markers */}
                <g id="vertices-layer">
                  {buildings.map((building) => {
                    const isBuildingSelected = building.id === selectedBuildingId;
                    if (!isBuildingSelected) return null;

                    return building.rawCoordinates.map(([lat, lon], idx) => {
                      const vx = toX(lon);
                      const vy = toY(lat);
                      const isVertexSelected = selectedVertex && 
                        selectedVertex.edificioId === building.id && 
                        selectedVertex.index === idx;
                      const isDraggedThis = draggedVertex && 
                        draggedVertex.edificioId === building.id && 
                        draggedVertex.index === idx;

                      return (
                        <circle
                          key={`vertex-${building.id}-${idx}`}
                          cx={vx}
                          cy={vy}
                          r={(isDraggedThis || isVertexSelected ? 8 : 4.5) / Math.pow(zoom, 0.65)}
                          className={`svg-vertex-marker ${isVertexSelected ? "selected" : ""}`}
                          fill={isDraggedThis ? "#ec4899" : isVertexSelected ? "var(--color-accent)" : "var(--bg-panel)"}
                          stroke={isDraggedThis ? "#ec4899" : building.strokeColor}
                          strokeWidth={(isDraggedThis ? 3 : 2) / zoom}
                          vectorEffect="non-scaling-stroke"
                          onMouseDown={(e) => handleVertexMouseDown(e, building.id, idx, lat, lon)}
                          onTouchStart={(e) => handleVertexTouchStart(e, building.id, idx, lat, lon)}
                          onClick={(e) => e.stopPropagation()}
                          title={`Vértice ${idx}: ${lat.toFixed(6)}, ${lon.toFixed(6)}`}
                        />
                      );
                    });
                  })}
                </g>

                {/* User simulated GPS marker location */}
                {userMarker && (
                  <g id="user-location-marker">
                    <circle
                      cx={toX(userMarker[1])}
                      cy={toY(userMarker[0])}
                      r={8 / Math.pow(zoom, 0.5)}
                      fill="none"
                      stroke="#ef4444"
                      className="gps-pulse-outer"
                      vectorEffect="non-scaling-stroke"
                    />
                    <circle
                      cx={toX(userMarker[1])}
                      cy={toY(userMarker[0])}
                      r={7 / Math.pow(zoom, 0.5)}
                      fill="#ef4444"
                      stroke="#ffffff"
                      strokeWidth={1.5 / zoom}
                      vectorEffect="non-scaling-stroke"
                      style={{ filter: "drop-shadow(0 0 4px rgba(239, 68, 68, 0.8))" }}
                    />
                  </g>
                )}

              </g>
            </svg>

            {/* Overlaid UI components on canvas */}
            <div className="map-controls-overlay">
              <div className="flex flex-col gap-2">
                <button 
                  className="overlay-btn" 
                  onClick={handleZoomIn}
                  title="Acercar (Zoom In)"
                >
                  <ZoomIn className="w-5 h-5" />
                </button>
                <button 
                  className="overlay-btn" 
                  onClick={handleZoomOut}
                  title="Alejar (Zoom Out)"
                >
                  <ZoomOut className="w-5 h-5" />
                </button>
                <button 
                  className="overlay-btn" 
                  onClick={handleZoomReset}
                  title="Restaurar Vista (Zoom 100%)"
                >
                  <Maximize className="w-5 h-5" />
                </button>
                <div className="overlay-btn" title="Cuadrícula WGS84" style={{ cursor: "default" }}>
                  <Layers className="w-5 h-5 text-indigo-500" />
                </div>
              </div>
            </div>

            {/* Floating Cursor Coordinate Inspector */}
            {mouseCoords && (
              <div className="map-coordinate-overlay">
                <div>
                  <span className="text-slate-400 font-semibold mr-1">LAT:</span>
                  <span>{mouseCoords.lat}°N</span>
                </div>
                <div>
                  <span className="text-slate-400 font-semibold mr-1">LON:</span>
                  <span>{mouseCoords.lon}°W</span>
                </div>
                <div className="mt-1 pt-1 border-t border-slate-700/50 flex gap-3 text-[10px] text-slate-500">
                  <span>PX: {mouseCoords.x}</span>
                  <span>PY: {mouseCoords.y}</span>
                </div>
              </div>
            )}

            {/* Premium Loader Overlay */}
            {isLoading && (
              <div className="map-loader-overlay">
                <div className="loader-card">
                  <RefreshCw className="animate-spin w-8 h-8 text-indigo-500" />
                  <h3>Cargando Mapa...</h3>
                  <p>
                    Despertando el servidor del backend y base de datos (Neon/Render). 
                    Esto puede tardar hasta 50 segundos si el servidor estaba inactivo (arranque en frío).
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Side - Control Panel Sidebar */}
        <aside className="sidebar-panel">
          
          {/* Card 0: Bounding Box and Overview Info */}
          <div className="sidebar-overview-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-400">Panel de Control Local</span>
              <span className="text-[10px] font-mono text-slate-500">Center: 19.5038°N, -99.1471°W</span>
            </div>
            <div className="overview-grid mt-1">
              <div className="overview-item">
                <span className="overview-label">Bounding Box</span>
                <span className="overview-value">WGS84 Conforme</span>
              </div>
              <div className="overview-item">
                <span className="overview-label">Entidades</span>
                <span className="overview-value">{buildings.length} polígonos</span>
              </div>
            </div>
          </div>

          {/* Premium Tab Selector pill container */}
          <div className="tab-container">
            <button 
              className={`tab-btn ${activeTab === "inspector" ? "active" : ""}`}
              onClick={() => setActiveTab("inspector")}
              title="Explorar y editar estructuras existentes"
            >
              <Layers className="w-4 h-4" />
              <span>Explorar</span>
            </button>
            <button 
              className={`tab-btn ${activeTab === "gps" ? "active" : ""}`}
              onClick={() => setActiveTab("gps")}
              title="Simular coordenadas GPS"
            >
              <MapPin className="w-4 h-4" />
              <span>Simular GPS</span>
            </button>
            <button 
              className={`tab-btn ${activeTab === "crear" ? "active" : ""}`}
              onClick={() => setActiveTab("crear")}
              title="Inyectar nueva entidad geográfica"
            >
              <Plus className="w-4 h-4" />
              <span>Inyectar</span>
            </button>
          </div>

          {/* Content Tab: Inspector & Explorer */}
          {activeTab === "inspector" && (
            <div className="flex flex-col gap-6">
              
              {/* Card 1: Vertex and Building Inspector */}
              <div className="sidebar-card">
                <h2 className="card-title">
                  <MousePointer className="w-4 h-4" />
                  Inspector de Vértices
                </h2>
                
                <div className="card-section">
                  {selectedVertex && activeBuilding ? (
                    <div className="flex flex-col gap-5">
                      
                      {/* Building Info Header */}
                      <div className="inspector-building-header">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="item-color-dot" style={{ backgroundColor: activeBuilding.color }} />
                            <span className="font-bold text-sm text-slate-100">{activeBuilding.name}</span>
                          </div>
                          <span className="text-[10px] font-mono bg-slate-800 text-slate-400 px-2 py-0.5 rounded border border-slate-700/50">
                            {activeBuilding.rawCoordinates.length} Vértices
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-mono mt-1">ID: {activeBuilding.id}</p>
                      </div>

                      {/* CAD-Style Vertex Paging Navigation Bar */}
                      <div className="vertex-nav-bar">
                        <button
                          type="button"
                          className="vertex-nav-btn"
                          onClick={handlePrevVertex}
                          title="Vértice anterior"
                        >
                          <ChevronLeft className="w-4 h-4" />
                          <span>Anterior</span>
                        </button>
                        
                        <div className="vertex-nav-indicator">
                          <span className="vertex-nav-current">#{selectedVertex.index + 1}</span>
                          <span className="vertex-nav-total">de {activeBuilding.rawCoordinates.length}</span>
                        </div>
                        
                        <button
                          type="button"
                          className="vertex-nav-btn"
                          onClick={handleNextVertex}
                          title="Vértice siguiente"
                        >
                          <span>Siguiente</span>
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>

                      {/* CAD Vertex Actions Grid */}
                      <div className="vertex-actions-grid">
                        <button
                          type="button"
                          className="btn-action-premium btn-action-add"
                          onClick={handleAddVertexAfter}
                          title="Añadir nuevo vértice después del activo"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Añadir</span>
                        </button>
                        
                        <button
                          type="button"
                          className="btn-action-premium btn-action-center"
                          onClick={handleCenterVertex}
                          title="Centrar mapa en este vértice"
                        >
                          <Crosshair className="w-3.5 h-3.5" />
                          <span>Centrar Vista</span>
                        </button>

                        <button
                          type="button"
                          className="btn-action-premium btn-action-delete"
                          onClick={handleDeleteVertex}
                          title="Eliminar este vértice"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Borrar</span>
                        </button>
                      </div>

                      {/* Metadata Details Grid */}
                      <div className="premium-detail-grid">
                        <div className="p-detail-item">
                          <span className="p-detail-label">Perímetro Estructura</span>
                          <span className="p-detail-value">{getPerimeter(activeBuilding.rawCoordinates).toFixed(2)} m</span>
                        </div>
                        <div className="p-detail-item">
                          <span className="p-detail-label">Proyección Canvas</span>
                          <span className="p-detail-value font-mono text-[11px]">
                            {selectedVertex.x.toFixed(1)}x, {selectedVertex.y.toFixed(1)}y
                          </span>
                        </div>
                      </div>

                      {/* Geodetic Bounds Status Badge */}
                      {(() => {
                        const latVal = parseFloat(editLat);
                        const lonVal = parseFloat(editLon);
                        const isInside = latVal >= LAT_MIN && latVal <= LAT_MAX && lonVal >= LON_MIN && lonVal <= LON_MAX;
                        return (
                          <div className={`status-badge-container ${isInside ? "status-ok" : "status-warn"}`}>
                            {isInside ? (
                              <>
                                <CheckCircle className="w-3.5 h-3.5" />
                                <span>Dentro de límites geodéticos (Campus)</span>
                              </>
                            ) : (
                              <>
                                <AlertTriangle className="w-3.5 h-3.5 animate-bounce-slow" />
                                <span>Fuera de límites del Campus WGS84</span>
                              </>
                            )}
                          </div>
                        );
                      })()}

                      {/* Coordinate Inputs Form */}
                      <form onSubmit={handleSaveVertexEdit} className="flex flex-col gap-4">
                        <div className="form-group-premium">
                          <div className="flex justify-between items-center mb-1">
                            <span className="form-label-premium">Latitud (WGS84 Y)</span>
                            <button
                              type="button"
                              className="btn-copy-coordinate"
                              onClick={() => handleCopy(editLat, "lat")}
                              title="Copiar Latitud"
                            >
                              {copiedType === "lat" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedType === "lat" ? "¡Copiado!" : "Copiar"}</span>
                            </button>
                          </div>
                          <div className="input-premium-wrapper">
                            <Globe className="input-premium-icon" />
                            <input
                              type="number"
                              step="any"
                              className="input-premium font-mono"
                              value={editLat}
                              onChange={(e) => setEditLat(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <div className="form-group-premium">
                          <div className="flex justify-between items-center mb-1">
                            <span className="form-label-premium">Longitud (WGS84 X)</span>
                            <button
                              type="button"
                              className="btn-copy-coordinate"
                              onClick={() => handleCopy(editLon, "lon")}
                              title="Copiar Longitud"
                            >
                              {copiedType === "lon" ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                              <span>{copiedType === "lon" ? "¡Copiado!" : "Copiar"}</span>
                            </button>
                          </div>
                          <div className="input-premium-wrapper">
                            <Globe className="input-premium-icon" />
                            <input
                              type="number"
                              step="any"
                              className="input-premium font-mono"
                              value={editLon}
                              onChange={(e) => setEditLon(e.target.value)}
                              required
                            />
                          </div>
                        </div>

                        <button type="submit" className="btn btn-primary btn-full btn-sm flex items-center justify-center gap-2 py-2.5">
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Aplicar Cambios Numéricos</span>
                        </button>
                      </form>

                      <div className="info-banner-premium">
                        <Move className="w-4 h-4 flex-shrink-0" />
                        <span>Tip: Arrastra el vértice directamente en el mapa para realizar ediciones visuales.</span>
                      </div>

                    </div>
                  ) : (
                    <div className="vertex-empty-state">
                      <div className="empty-state-icon-wrapper">
                        <MousePointer className="empty-state-icon" />
                      </div>
                      <p className="empty-state-title">Ningún vértice seleccionado</p>
                      <p className="empty-state-desc">
                        Haz clic en cualquier estructura o vértice en el mapa para iniciar la inspección de metadatos y edición topológica.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Card 2: Map Entities List */}
              <div className="sidebar-card">
                <h2 className="card-title">
                  <Layers className="w-4 h-4" />
                  Estructuras en el Mapa ({buildings.length})
                </h2>
                <div className="card-section">
                  <div className="item-list">
                    {buildings.map((b) => (
                      <div 
                        key={b.id}
                        className={`item-row ${b.id === selectedBuildingId ? "selected" : ""}`}
                        onClick={() => {
                          setSelectedBuildingId(b.id);
                          const activeVertex = b.rawCoordinates[0];
                          setSelectedVertex({
                            edificioId: b.id,
                            index: 0,
                            lat: activeVertex[0],
                            lon: activeVertex[1],
                            x: toX(activeVertex[1]),
                            y: toY(activeVertex[0])
                          });
                          setEditLat(activeVertex[0].toFixed(8));
                          setEditLon(activeVertex[1].toFixed(8));
                        }}
                      >
                        <div className="item-info">
                          <span className="item-color-dot" style={{ backgroundColor: b.color }} />
                          <span className="item-name">{b.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="item-details">{b.rawCoordinates.length} Vérts</span>
                          <button
                            className="btn btn-secondary btn-sm p-1 border-none bg-transparent"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteBuilding(b.id);
                            }}
                            title="Eliminar estructura"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500 hover:text-rose-600" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>
          )}

          {/* Content Tab: GPS Simulator */}
          {activeTab === "gps" && (
            <div className="sidebar-card">
              <h2 className="card-title">
                <MapPin className="w-4 h-4" />
                Simulador GPS en Tiempo Real
              </h2>
              <form onSubmit={handleGpsSubmit} className="card-section">
                <div className="form-input-row">
                  <div className="form-group">
                    <label className="form-label">Latitud</label>
                    <div className="input-with-icon">
                      <MapPin className="input-icon" />
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        placeholder="19.503..."
                        value={gpsLat}
                        onChange={(e) => setGpsLat(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Longitud</label>
                    <div className="input-with-icon">
                      <MapPin className="input-icon" />
                      <input
                        type="number"
                        step="any"
                        className="form-input font-mono"
                        placeholder="-99.146..."
                        value={gpsLon}
                        onChange={(e) => setGpsLon(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                </div>

                {gpsFeedback && (
                  <div className={`feedback-box ${
                    gpsFeedback.type === "success" ? "feedback-success" : 
                    gpsFeedback.type === "warning" ? "feedback-warning" : "feedback-error"
                  }`}>
                    {gpsFeedback.type === "success" && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                    {gpsFeedback.type === "warning" && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                    {gpsFeedback.type === "error" && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                    <span>{gpsFeedback.message}</span>
                  </div>
                )}

                <button type="submit" className="btn btn-primary btn-full" disabled={isTrackingLive}>
                  <Compass className={`w-4 h-4 ${isTrackingLive ? "" : "animate-spin-slow"}`} />
                  Renderizar Posición GPS (Simulado)
                </button>

                <div className="flex items-center gap-2 my-2 justify-center text-xs text-slate-500 font-semibold">
                  <span className="h-px bg-slate-700/30 flex-1" />
                  <span>Ó</span>
                  <span className="h-px bg-slate-700/30 flex-1" />
                </div>

                <button
                  type="button"
                  className={`btn ${isTrackingLive ? "btn-danger" : "btn-secondary"} btn-full flex items-center justify-center gap-2 py-2.5`}
                  onClick={toggleLiveGeolocation}
                >
                  {isTrackingLive ? (
                    <>
                      <span className="live-pulse-indicator" />
                      <span>Detener Geolocalización Real</span>
                    </>
                  ) : (
                    <>
                      <Compass className="w-4 h-4 text-emerald-500 animate-pulse" />
                      <span>Obtener Ubicación Real (GPS)</span>
                    </>
                  )}
                </button>

                {/* Quick Preset Buttons */}
                <div className="flex flex-col gap-2 mt-2">
                  <span className="form-label">Puntos de Referencia Campus:</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSetGpsPreset(19.50427925, -99.14749565, "Edificio 1 (Esquina)")}
                    >
                      Vértice Ed. 1
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSetGpsPreset(19.50387926, -99.14710716, "Centro del Campus")}
                    >
                      Centro Campus
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSetGpsPreset(19.50190000, -99.14750000, "Entrada Sur")}
                    >
                      Entrada Sur
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleSetGpsPreset(19.50580000, -99.14580000, "Límite Norte")}
                    >
                      Límite Norte
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Content Tab: Add Building form */}
          {activeTab === "crear" && (
            <div className="sidebar-card">
              <h2 className="card-title">
                <Plus className="w-4 h-4" />
                Inyección de Nueva Estructura
              </h2>
              <form onSubmit={handleCreateBuilding} className="card-section">
                
                <div className="form-group">
                  <label className="form-label">Nombre de Estructura</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Ej. Edificio 4 (Cómputo)"
                    value={newBuildingName}
                    onChange={(e) => setNewBuildingName(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Color de Relleno</label>
                  <div className="flex gap-3 items-center">
                    <input
                      type="color"
                      className="w-10 h-10 rounded cursor-pointer border border-slate-700 bg-transparent"
                      value={newBuildingColor}
                      onChange={(e) => setNewBuildingColor(e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-input font-mono flex-1 text-xs"
                      value={newBuildingColor}
                      onChange={(e) => setNewBuildingColor(e.target.value)}
                      required
                    />
                  </div>
                  {/* Visual palette presets */}
                  <div className="color-presets">
                    {["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#64748b"].map((col) => (
                      <button
                        key={col}
                        type="button"
                        className={`color-preset-btn ${newBuildingColor === col ? "selected" : ""}`}
                        style={{ backgroundColor: col }}
                        onClick={() => setNewBuildingColor(col)}
                      />
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <div className="flex justify-between items-center">
                    <label className="form-label">Coordenadas Vértices (Lat, Lon)</label>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm px-1.5 py-0.5 text-[10px]"
                        onClick={() => handleLoadVerticesPreset("triangulo")}
                      >
                        Triángulo
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm px-1.5 py-0.5 text-[10px]"
                        onClick={() => handleLoadVerticesPreset("rectangulo")}
                      >
                        Rectángulo
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="form-input form-textarea text-xs"
                    placeholder={`19.5042, -99.1470&#10;19.5045, -99.1465&#10;19.5038, -99.1462`}
                    value={newBuildingVertices}
                    onChange={(e) => setNewBuildingVertices(e.target.value)}
                    required
                  />
                  <span className="text-[10px] text-slate-500">
                    Ingrese un par de coordenadas geográficas por línea en formato decimal (ej: Latitud, Longitud). Mínimo 3 vértices.
                  </span>
                </div>

                {injectionFeedback && (
                  <div className={`feedback-box ${
                    injectionFeedback.type === "success" ? "feedback-success" : 
                    injectionFeedback.type === "info" ? "feedback-info" : "feedback-error"
                  }`}>
                    {injectionFeedback.type === "success" && <CheckCircle className="w-4 h-4 flex-shrink-0" />}
                    {injectionFeedback.type === "info" && <HelpCircle className="w-4 h-4 flex-shrink-0" />}
                    {injectionFeedback.type === "error" && <AlertTriangle className="w-4 h-4 flex-shrink-0" />}
                    <span>{injectionFeedback.message}</span>
                  </div>
                )}

                <button type="submit" className="btn btn-primary btn-full">
                  <Plus className="w-4 h-4" />
                  Crear Estructura
                </button>
              </form>
            </div>
          )}

        </aside>
      </main>
    </div>
  );
}
