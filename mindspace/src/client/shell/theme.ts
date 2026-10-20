export function toggleTheme() {
  const dark = document.documentElement.classList.toggle("dark");
  try {
    localStorage.setItem("mindspace:theme", dark ? "dark" : "light");
  } catch {
    /* ignore */
  }
}
