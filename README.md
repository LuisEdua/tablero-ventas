# Tablero de Ventas

Tablero comercial interactivo, 100 % estático (HTML + CSS + JS, sin build), listo para GitHub Pages.

## Contenido

- **KPIs**: ventas netas, utilidad bruta, margen bruto, unidades, transacciones y ticket promedio, con variación contra el periodo anterior de igual duración y tendencia mensual.
- **Filtros**: periodo (preajustes o rango personalizado), región, categoría, producto (depende de la categoría), canal y cliente, con búsqueda dentro de cada lista. Los filtros activos se muestran como chips.
- **Filtrado cruzado**: haz clic en una barra, celda del mapa de calor, punto o fila de tabla para filtrar por ese valor.
- **Pestañas**
  - *Resumen*: evolución de ventas y utilidad (día / semana / mes), ventas por categoría, región y canal, venta promedio por día de la semana, mapa de calor región × categoría y mezcla de canales por mes.
  - *Productos*: ventas vs. margen, margen por categoría y tabla de desempeño ordenable.
  - *Clientes*: top 15, curva de concentración y cartera de clientes con búsqueda.
  - *Detalle*: todas las transacciones filtradas, con orden, búsqueda y paginación.
- **Exportar CSV** de los registros filtrados, **modo claro/oscuro** y **URL compartible**: el estado de los filtros se guarda en el hash de la URL.

## Estructura

```
index.html
assets/styles.css
assets/app.js
data/ventas_demo.csv   ← dataset (reemplázalo con el mismo encabezado para actualizar)
.nojekyll
```

Columnas esperadas en el CSV:
`fecha,region,categoria,producto,canal,cliente,cantidad,precio_unitario,costo_unitario`

## Ver en local

El navegador no carga el CSV desde `file://`, así que hay que servir la carpeta:

```bash
python3 -m http.server 8000
```

Luego abre http://localhost:8000

## Publicar en GitHub Pages

1. Crea un repositorio en GitHub y sube el contenido de esta carpeta:
   ```bash
   git init
   git add .
   git commit -m "Tablero de ventas"
   git branch -M main
   git remote add origin https://github.com/<usuario>/<repo>.git
   git push -u origin main
   ```
2. En el repositorio ve a **Settings → Pages**, en *Build and deployment* elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`, y guarda.
3. En un par de minutos queda publicado en `https://<usuario>.github.io/<repo>/`.

Librerías por CDN: [Apache ECharts 5.5.1](https://echarts.apache.org/) y [Papa Parse 5.4.1](https://www.papaparse.com/).
