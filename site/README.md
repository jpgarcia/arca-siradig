# Landing de arca-siradig

Sitio estático, sin dependencias, analíticas ni conexión a ARCA.
Página pública: https://jpgarcia.github.io/arca-siradig/.

Desde la raíz del repositorio:

```bash
npm run site:preview
```

Abrí http://localhost:4173. El servidor escucha solo en tu computadora.

## GitHub Pages

El workflow `.github/workflows/pages.yml` publica únicamente `site/` mediante
GitHub Actions. Se ejecuta cuando un push a main cambia la landing o el workflow;
también se puede ejecutar manualmente. Pages debe usar GitHub Actions como origen.

Los enlaces a CSS y JavaScript son relativos para funcionar bajo `/arca-siradig/`.
No se publican sesiones, credenciales ni archivos de inspección.

La guía usa el paquete npm 1.1.1 con setup. Antes de actualizar la versión,
verificá los comandos y publicá el paquete antes de desplegar la guía.
Las fuentes oficiales están enlazadas en la propia landing.
