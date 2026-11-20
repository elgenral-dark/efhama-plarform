(() => {
  const darkVisuals = new Map();

  const darkTextColors = new Map([
    ["#3c4ae8", "#93c5fd"],
    ["#1e40af", "#93c5fd"],
    ["#1d4ed8", "#93c5fd"],
    ["#26324a", "#f8fafc"],
    ["#27324a", "#f8fafc"],
    ["#172033", "#f8fafc"],
    ["#0f172a", "#f8fafc"],
    ["#1e293b", "#f8fafc"],
    ["#334155", "#f8fafc"],
    ["#475569", "#cbd5e1"],
    ["#16804a", "#6ee7b7"],
    ["#16784b", "#6ee7b7"],
    ["#20a36a", "#6ee7b7"],
    ["#20b26b", "#6ee7b7"],
    ["#15803d", "#6ee7b7"],
    ["#b42318", "#fca5a5"],
    ["#dc2626", "#fca5a5"],
    ["#62430a", "#fcd34d"],
    ["#d58b18", "#fcd34d"],
    ["#b45309", "#fcd34d"],
    ["#6b7280", "#94a3b8"],
    ["#5f6b85", "#94a3b8"],
    ["#64748b", "#94a3b8"],
  ]);

  const darkBoxFills = new Map([
    ["#eef0ff", "#162238"],
    ["#e5e8ff", "#162238"],
    ["#f3f5ff", "#162238"],
    ["#f5f7ff", "#162238"],
    ["#f7f8ff", "#162238"],
    ["#e0e7ff", "#162238"],
    ["#eef2ff", "#162238"],
    ["#edfff5", "#132a1e"],
    ["#dcfce7", "#132a1e"],
    ["#ecfdf5", "#132a1e"],
    ["#f0fdf4", "#132a1e"],
    ["#fff7e6", "#2a2012"],
    ["#fef3c7", "#2a2012"],
    ["#fffbeb", "#2a2012"],
    ["#fef9c3", "#2a2012"],
    ["#f3edff", "#251838"],
    ["#f3e8ff", "#251838"],
    ["#ede9fe", "#251838"],
    ["#faf5ff", "#251838"],
    ["#fff0f0", "#2d1616"],
    ["#fee2e2", "#2d1616"],
    ["#fef2f2", "#2d1616"],
    ["#f8fafc", "#182236"],
    ["#f1f5f9", "#182236"],
    ["#f3f4f6", "#182236"],
  ]);

  const darkStrokes = new Map([
    ["#3c4ae8", "#60a5fa"],
    ["#1e40af", "#60a5fa"],
    ["#20a36a", "#34d399"],
    ["#20b26b", "#34d399"],
    ["#15803d", "#34d399"],
    ["#d58b18", "#fbbf24"],
    ["#e49a17", "#fbbf24"],
    ["#b45309", "#fbbf24"],
    ["#7c4dcc", "#c084fc"],
    ["#7580ed", "#818cf8"],
    ["#7d87ee", "#818cf8"],
    ["#d94b4b", "#f87171"],
    ["#dc2626", "#f87171"],
  ]);

  function isLightHex(hex) {
    if (!hex || !hex.startsWith("#")) return false;
    let r = 0, g = 0, b = 0;
    if (hex.length === 4) {
      r = parseInt(hex[1] + hex[1], 16);
      g = parseInt(hex[2] + hex[2], 16);
      b = parseInt(hex[3] + hex[3], 16);
    } else if (hex.length === 7) {
      r = parseInt(hex.slice(1, 3), 16);
      g = parseInt(hex.slice(3, 5), 16);
      b = parseInt(hex.slice(5, 7), 16);
    } else {
      return false;
    }
    // Relative luminance
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return lum > 0.65;
  }

  const createDarkSvg = async (imagePath) => {
    const response = await fetch(imagePath);
    if (!response.ok) throw new Error(`Unable to load educational visual (${response.status}): ${imagePath}`);

    const parsed = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
    const svg = parsed.documentElement;
    const viewBox = (svg.getAttribute("viewBox") || "").trim().split(/[ ,]+/).map(Number);
    if (svg.localName !== "svg" || parsed.querySelector("parsererror") || viewBox.length !== 4 || viewBox.some((value) => !Number.isFinite(value))) {
      throw new Error(`Invalid educational SVG: ${imagePath}`);
    }

    const [viewX, viewY, viewWidth, viewHeight] = viewBox;
    let backgroundUpdated = false;

    // 1. Update background canvas and inner boxes
    svg.querySelectorAll("rect").forEach((rect) => {
      const fill = (rect.getAttribute("fill") || "").toLowerCase().trim();
      const x = Number(rect.getAttribute("x") || 0);
      const y = Number(rect.getAttribute("y") || 0);
      const width = Number(rect.getAttribute("width") || 0);
      const height = Number(rect.getAttribute("height") || 0);

      // Check if it's the main canvas background
      if (x === viewX && y === viewY && width >= viewWidth && height >= viewHeight && ["#fff", "#ffffff", "white"].includes(fill)) {
        rect.setAttribute("fill", "#0B1220");
        backgroundUpdated = true;
      } else if (darkBoxFills.has(fill)) {
        // Known light fill
        rect.setAttribute("fill", darkBoxFills.get(fill));
      } else if (["#fff", "#ffffff", "white"].includes(fill)) {
        // Inner white cards
        rect.setAttribute("fill", "#182236");
      } else if (isLightHex(fill)) {
        // Any other light fill
        rect.setAttribute("fill", "#182236");
      }

      // Check strokes on rects
      const stroke = (rect.getAttribute("stroke") || "").toLowerCase().trim();
      if (darkStrokes.has(stroke)) {
        rect.setAttribute("stroke", darkStrokes.get(stroke));
      }
    });

    if (!backgroundUpdated) throw new Error(`Educational SVG has no recognized white canvas: ${imagePath}`);

    // 2. Update text colors
    svg.querySelectorAll("text").forEach((text) => {
      const fill = (text.getAttribute("fill") || "").toLowerCase().trim();
      if (darkTextColors.has(fill)) {
        text.setAttribute("fill", darkTextColors.get(fill));
      } else if (!fill || fill === "#000" || fill === "#000000" || fill === "black" || fill === "#111" || fill === "#222" || fill === "#333") {
        text.setAttribute("fill", "#f8fafc");
      }
    });

    // 3. Update paths, markers, polygons, and shapes (strokes & fills)
    svg.querySelectorAll("path, line, polyline, circle, polygon, ellipse, g").forEach((el) => {
      const stroke = (el.getAttribute("stroke") || "").toLowerCase().trim();
      if (darkStrokes.has(stroke)) {
        el.setAttribute("stroke", darkStrokes.get(stroke));
      }
      const fill = (el.getAttribute("fill") || "").toLowerCase().trim();
      if (darkBoxFills.has(fill)) {
        el.setAttribute("fill", darkBoxFills.get(fill));
      } else if (darkTextColors.has(fill)) {
        el.setAttribute("fill", darkTextColors.get(fill));
      } else if (darkStrokes.has(fill)) {
        el.setAttribute("fill", darkStrokes.get(fill));
      } else if (isLightHex(fill) && el.tagName.toLowerCase() !== "text") {
        el.setAttribute("fill", "#182236");
      }
    });

    // 4. Update defs / markers
    svg.querySelectorAll("marker path").forEach((el) => {
      const fill = (el.getAttribute("fill") || "").toLowerCase().trim();
      if (darkStrokes.has(fill)) {
        el.setAttribute("fill", darkStrokes.get(fill));
      }
    });

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  };

  window.EfhamhaImageTheme = Object.freeze({
    darkSource(imagePath) {
      if (!/\.svg(?:$|[?#])/i.test(imagePath)) {
        return Promise.reject(new Error(`Dark adaptation is only supported for educational SVGs: ${imagePath}`));
      }
      if (!darkVisuals.has(imagePath)) darkVisuals.set(imagePath, createDarkSvg(imagePath));
      return darkVisuals.get(imagePath);
    },
  });
})();
