const tabs = [...document.querySelectorAll('[role="tab"]')];
function selectTab(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute("aria-selected", String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute("aria-controls")).hidden = !selected;
  }
}
for (const tab of tabs) {
  tab.addEventListener("click", () => selectTab(tab));
  tab.addEventListener("keydown", (event) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const index = tabs.indexOf(tab);
    const next =
      event.key === "Home"
        ? tabs[0]
        : event.key === "End"
          ? tabs.at(-1)
          : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
    selectTab(next);
    next.focus();
  });
}
for (const button of document.querySelectorAll(".copy")) {
  button.addEventListener("click", async () => {
    const content = button.parentElement.querySelector("code, p").textContent;
    const status = document.getElementById("copy-status");
    try {
      await navigator.clipboard.writeText(content);
      button.textContent = "Copiado ✓";
      status.textContent = "Texto copiado al portapapeles.";
    } catch {
      button.textContent = "Seleccioná el texto";
      status.textContent = "No se pudo copiar. Seleccioná el texto y copialo manualmente.";
    }
    setTimeout(() => {
      button.textContent = "Copiar";
    }, 2500);
  });
}
