(() => {
  const darkVisuals = new Map();
  const darkTextColors = new Map([
    ["#3c4ae8", "#9aa7ff"],
    ["#26324a", "#e5e7eb"],
    ["#27324a", "#e5e7eb"],
    ["#172033", "#e5e7eb"],
    ["#0f172a", "#e5e7eb"],
    ["#16804a", "#86efac"],
    ["#16784b", "#86efac"],
    ["#b42318", "#fca5a5"],
    ["#62430a", "#f6c95d"],
    ["#6b7280", "#a8b1c3"],
    ["#5f6b85", "#a8b1c3"],
  ]);

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
    svg.querySelectorAll("rect").forEach((rect) => {
      const fill = (rect.getAttribute("fill") || "").toLowerCase();
      const x = Number(rect.getAttribute("x") || 0);
      const y = Number(rect.getAttribute("y") || 0);
      const width = Number(rect.getAttribute("width"));
      const height = Number(rect.getAttribute("height"));
      if (x === viewX && y === viewY && width >= viewWidth && height >= viewHeight && ["#fff", "#ffffff", "white"].includes(fill)) {
        rect.setAttribute("fill", "#171b24");
        backgroundUpdated = true;
      }
    });
    if (!backgroundUpdated) throw new Error(`Educational SVG has no recognized white canvas: ${imagePath}`);

    svg.querySelectorAll("text[fill]").forEach((text) => {
      const fill = text.getAttribute("fill").toLowerCase();
      if (darkTextColors.has(fill)) text.setAttribute("fill", darkTextColors.get(fill));
    });

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(svg))}`;
  };

  window.EfhamaImageTheme = Object.freeze({
    darkSource(imagePath) {
      if (!/\.svg(?:$|[?#])/i.test(imagePath)) {
        return Promise.reject(new Error(`Dark adaptation is only supported for educational SVGs: ${imagePath}`));
      }
      if (!darkVisuals.has(imagePath)) darkVisuals.set(imagePath, createDarkSvg(imagePath));
      return darkVisuals.get(imagePath);
    },
  });
})();
