# RISSPO Search

Buscador local de comercios y productos construido con Vite, Tailwind CSS y Supabase.

## 🚀 Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Crea un archivo `.env` en la raíz del proyecto (puedes copiar `.env.example`):
```bash
cp .env.example .env
```

3. Edita `.env` con tus credenciales de Supabase:
```
VITE_SUPABASE_URL=tu_url_de_supabase
VITE_SUPABASE_ANON_KEY=tu_clave_anonima
```

## 📦 Scripts Disponibles

- `npm run dev` - Inicia el servidor de desarrollo
- `npm run build` - Construye la aplicación para producción
- `npm run preview` - Previsualiza la build de producción

## 📁 Estructura del Proyecto

```
├── src/
│   ├── api/
│   │   └── supabase.js          # Cliente de Supabase
│   ├── components/
│   │   └── renderer.js           # Funciones de renderizado
│   ├── services/
│   │   └── searchService.js      # Lógica de búsqueda
│   ├── utils/
│   │   ├── dom.js                # Utilidades DOM
│   │   └── navigation.js         # Navegación entre vistas
│   ├── main.js                   # Punto de entrada
│   └── style.css                 # Estilos globales
├── index.html                    # HTML principal
├── package.json
├── vite.config.js
├── tailwind.config.js
└── postcss.config.js
```

## 🔧 Tecnologías

- **Vite** - Build tool y dev server
- **Tailwind CSS** - Framework de estilos
- **Supabase** - Backend como servicio
- **ES6 Modules** - Módulos JavaScript modernos

