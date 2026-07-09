/** Sets a CSS custom property on an element, removing any existing definition first. */
export function applyStyleToElement(
  element: HTMLElement,
  key: string,
  value: string,
) {
  const currentStyle = element.getAttribute("style") || "";
  const cleanedStyle = currentStyle
    .replace(new RegExp(`--${key}:\\s*[^;]+;?`, "g"), "")
    .trim();

  element.setAttribute("style", `${cleanedStyle}--${key}: ${value};`);
}
