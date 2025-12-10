# 🔄 Guía de Migración - De Búsqueda Estricta a Relevancia Expandida

## Para Desarrolladores

### ¿Qué Cambió?

| Elemento | Anterior | Nuevo | Impacto |
|----------|----------|-------|--------|
| **Detección de Rubro** | `detectarRubroEstricto()` → retorna `string` | `detectarContextoDeRubros()` → retorna `Array<string>` | Múltiples rubros con prioridades |
| **Búsqueda de Productos** | `obtenerProductosPorRubro(term, rubro: string)` | `obtenerProductosPorRubro(term, rubros: Array\|string)` | Acepta array o string (compatible) |
| **Búsqueda de Negocios** | `obtenerNegociosPorRubro(rubro: string)` | `obtenerNegociosPorRubro(rubros: Array\|string)` | Acepta array o string (compatible) |
| **Ordenamiento** | N/A (un rubro) | Por índice en array de contexto | Controla orden de visualización |

### Cambios en `searchService.js`

#### ❌ Eliminada
```javascript
export async function detectarRubroEstricto(term) {
  // ELIMINADA - Reemplazada por detectarContextoDeRubros
}
```

#### ✨ Nueva
```javascript
export async function detectarContextoDeRubros(term) {
  // Retorna: ["Hamburguesería", "Restaurante", "Comida Rápida", ...]
  // - Núcleo: match exacto + keywords (Prioridad 1)
  // - Periferia: búsqueda semántica (Prioridad 2)
}
```

#### 🔄 Actualizada (Backward Compatible)
```javascript
// Antes: obtenerProductosPorRubro(term, "Hamburguesería")
// Ahora: obtenerProductosPorRubro(term, "Hamburguesería")     ← Aún funciona
// Ahora: obtenerProductosPorRubro(term, ["Hamburguesería", "Restaurante"]) ← Nuevo

export async function obtenerProductosPorRubro(term, rubros) {
  const rubrosArray = Array.isArray(rubros) ? rubros : [rubros];
  // Resto de lógica igual, pero busca en TODO el array
}
```

### Cambios en `main.js`

#### Import Actualizado
```javascript
// Antes
import { detectarRubroEstricto, ... } from './services/searchService.js';

// Ahora
import { detectarContextoDeRubros, ... } from './services/searchService.js';
```

#### `performSearch()` - Lógica de PASO 2

**Antes:**
```javascript
const rubroDetectado = await detectarRubroEstricto(searchTerm);
// → Retorna: { nombre: "Hamburguesería", metodo: "keyword", ... }

if (!rubroDetectado) {
  showNoResults();
  return;
}

const productos = await obtenerProductosPorRubro(searchTerm, rubroDetectado.nombre);
```

**Ahora:**
```javascript
const contextoDatos = await detectarContextoDeRubros(searchTerm);
// → Retorna: ["Hamburguesería", "Restaurante", "Comida Rápida", ...]

if (!contextoDatos || contextoDatos.length === 0) {
  showNoResults();
  return;
}

const productos = await obtenerProductosPorRubro(searchTerm, contextoDatos);
// Los productos ya vienen ordenados por prioridad
```

---

## Compatibilidad

### ✅ Funciones Backward Compatible

```javascript
// Estos llamadas siguen funcionando sin cambios
obtenerNegociosPorRubro("Hamburguesería");
obtenerProductosPorRubro(term, "Hamburguesería");
obtenerTodosProductosDelRubro("Hamburguesería");

// Ahora también puedes pasar arrays
obtenerNegociosPorRubro(["Hamburguesería", "Restaurante"]);
obtenerProductosPorRubro(term, ["Hamburguesería", "Restaurante"]);
```

### ❌ Breaking Changes

```javascript
// Esta función FUE ELIMINADA
const rubro = await detectarRubroEstricto(term);
// ❌ Error: detectarRubroEstricto is not defined

// Usa en su lugar:
const contexto = await detectarContextoDeRubros(term);
// ✅ Funciona
```

---

## Migración de Código Existente

### Si tenías código que usa `detectarRubroEstricto()`

**Antes:**
```javascript
const rubro = await detectarRubroEstricto("Hamburguesa");
if (rubro) {
  const productos = await obtenerProductosPorRubro(term, rubro.nombre);
}
```

**Después:**
```javascript
const contexto = await detectarContextoDeRubros("Hamburguesa");
if (contexto && contexto.length > 0) {
  const productos = await obtenerProductosPorRubro(term, contexto);
}
```

### Si tenías código que usa `obtenerNegociosPorRubro()` con string

```javascript
// Esta sintaxis sigue funcionando
const negocios = await obtenerNegociosPorRubro("Hamburguesería");

// Ahora puedes también hacer esto
const negocios = await obtenerNegociosPorRubro(["Hamburguesería", "Restaurante"]);
```

---

## Testing de Integración

### Test 1: Verificar Contexto Multi-Rubro
```javascript
async function test1() {
  const contexto = await detectarContextoDeRubros("Hamburguesa");
  
  console.assert(Array.isArray(contexto), "Debe ser array");
  console.assert(contexto.includes("Hamburguesería"), "Debe incluir Hamburguesería");
  console.assert(contexto.length > 1, "Debe tener más de 1 rubro");
  
  console.log("✅ Test 1 pasado: Contexto multi-rubro funciona");
}
```

### Test 2: Verificar Ordenamiento
```javascript
async function test2() {
  const contexto = await detectarContextoDeRubros("Hamburguesa");
  // Núcleo debe estar primero
  console.assert(contexto[0] === "Hamburguesería", "Núcleo debe ser primero");
  
  const productos = await obtenerProductosPorRubro("Hamburguesa", contexto);
  
  // Verificar que están ordenados
  let ultimaPrioridad = -1;
  productos.forEach(p => {
    const prioridad = contexto.indexOf(p.negocios.rubro);
    console.assert(prioridad >= ultimaPrioridad, "Debe estar ordenado");
    ultimaPrioridad = prioridad;
  });
  
  console.log("✅ Test 2 pasado: Ordenamiento funciona");
}
```

### Test 3: Backward Compatibility
```javascript
async function test3() {
  // String sigue funcionando
  const negocios1 = await obtenerNegociosPorRubro("Hamburguesería");
  console.assert(Array.isArray(negocios1), "Debe retornar array");
  
  // Array también funciona
  const negocios2 = await obtenerNegociosPorRubro(["Hamburguesería"]);
  console.assert(Array.isArray(negocios2), "Debe retornar array");
  
  console.log("✅ Test 3 pasado: Backward compatibility funciona");
}
```

---

## Verificación Rápida

### Console
```javascript
// En la consola del navegador:

// 1. Verificar que la nueva función existe
console.log(typeof detectarContextoDeRubros); // "function"

// 2. Probar una búsqueda
window.performSearch("Hamburguesa");
// Verifica en la consola que ves:
//   "2️⃣ PASO 2: Detectando Contexto de Rubros..."
//   "✅ PASO 2 ÉXITO: Contexto de N rubro(s) detectado: [...]"

// 3. Verificar que obtenerProductosPorRubro acepta array
const productos = await obtenerProductosPorRubro("Hamburguesa", ["Hamburguesería", "Restaurante"]);
console.log(productos.length); // > 0
```

---

## FAQ

### P: ¿Qué pasa si paso un string donde espera array?
R: Funciona gracias a normalización interna:
```javascript
const rubrosArray = Array.isArray(rubros) ? rubros : [rubros];
// Si es string, lo convierte a array de 1 elemento
```

### P: ¿Se rompió mi código que usa `detectarRubroEstricto()`?
R: Sí. Reemplazarlo por `detectarContextoDeRubros()` y manejar array:
```javascript
// Antes
const rubro = await detectarRubroEstricto(term);
// Después
const rubros = await detectarContextoDeRubros(term);
```

### P: ¿El ordenamiento se hace automáticamente?
R: Sí. Tanto `obtenerProductosPorRubro()` como `obtenerNegociosPorRubro()` ordenan automáticamente por índice en el array del contexto.

### P: ¿Puedo cambiar el orden del contexto?
R: Sí, reordena el array antes de pasarlo:
```javascript
let contexto = await detectarContextoDeRubros(term);
contexto = ["Restaurante", "Hamburguesería", ...]; // Reordenar manualmente
const productos = await obtenerProductosPorRubro(term, contexto);
```

### P: ¿Se ejecuta siempre la búsqueda semántica?
R: Sí, ahora es un complemento, no un fallback. En `detectarContextoDeRubros()` siempre se ejecuta después del núcleo.

---

## Rollback (Si es Necesario)

Para revertir a búsqueda estricta, cambiar PASO 2 en `performSearch()`:

```javascript
// Volver a búsqueda estricta (devuelve solo 1 rubro)
const rubro = await detectarContextoDeRubros(searchTerm);
const primerRubro = rubro && rubro.length > 0 ? [rubro[0]] : null;
// Luego usar primerRubro en lugar de contexto completo
```

---

## Resumen de Cambios

- **Archivos Modificados:** 2
  - `src/services/searchService.js`
  - `src/main.js`

- **Funciones Nuevas:** 1
  - `detectarContextoDeRubros()`

- **Funciones Eliminadas:** 1
  - `detectarRubroEstricto()`

- **Funciones Actualizadas:** 3
  - `obtenerNegociosPorRubro()` (acepta array)
  - `obtenerProductosPorRubro()` (acepta array)
  - `obtenerTodosProductosDelRubro()` (acepta array)

- **Funciones Sin Cambios:** 6
  - `buscarNegocioDirecto()`, `searchProductos()`, etc.

- **Backward Compatibility:** 90% (solo `detectarRubroEstricto()` broke)

