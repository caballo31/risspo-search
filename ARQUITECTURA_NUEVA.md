# Arquitectura de Búsqueda - Jerarquía Top-Down Estricta

## Resumen Ejecutivo

El motor de búsqueda ha sido completamente reestructurado para garantizar **coherencia de resultados** mediante una jerarquía estricta top-down. Se elimina la "inferencia inversa" (adivinar rubro desde productos mal categorizados) y se implementa un flujo secuencial de tres pasos con responsabilidades claras.

---

## Arquitectura en 3 Pasos

### PASO 1: Búsqueda de Negocio (Prioridad Máxima)

**Función:** `buscarNegocioDirecto(term)` en `searchService.js`

**Lógica:**
- Busca coincidencia `ilike` (case-insensitive) en `negocios.nombre`
- Si encuentra un negocio, **DETIENE AQUÍ**
- Muestra el perfil completo del negocio + sus productos asociados
- Nunca continúa a los pasos 2 y 3

**Ejemplo:**
```
Búsqueda: "Mc Donald's"
→ Encontrado: Negocio "Mc Donald's"
→ Mostrar perfil + menú
✅ FIN
```

---

### PASO 2: Detección de Rubro (La Fuente de la Verdad)

**Función:** `detectarRubroEstricto(term)` en `searchService.js`

**Estrategia Jerárquica (3 métodos, solo uno necesario):**

#### Método A: Match Exacto en Rubros
- Busca `ilike` directo en tabla `rubros.nombre`
- Ej: "Ferretería", "Comida", "Farmacia"

#### Método B: Palabras Clave
- Usa RPC `buscar_keywords` para inferir rubro
- Ej: "martillo" → "Ferretería"

#### Método C: Embedding de Rubro (Último Recurso)
- Consulta `/api/search-semantic` para obtener rubro vectorial
- Extrae `rubro` del negocio más similar
- Requiere `similarity > 0.5`

**RESTRICCIÓN CRÍTICA:** 
🚫 **PROHIBIDO** buscar productos para adivinar el rubro
- Si el Paso 2 falla completamente, no hay búsqueda coherente
- Mostrar "Sin resultados" vs. especular sobre categoría

**Retorno:**
```javascript
{
  nombre: "Ferretería",
  id: 123,
  metodo: "exacto" | "keyword" | "vectorial",
  similarity: 0.75  // solo si método C
}
```

---

### PASO 3: Recuperación de Contenido (Scopeado al Rubro)

**Funciones:**
- `obtenerNegociosPorRubro(rubro)` 
- `obtenerProductosPorRubro(term, rubro)`

**Lógica de Productos (Sub-estrategia):**

#### Sub-Paso A: ilike por Nombre
- Busca `ilike` en `productos.titulo`
- Filtro: `negocios.rubro = [RubroDetectado]`
- Soporte de plurales (ej: "tornillos" → "tornillo")

#### Sub-Paso B: Búsqueda Vectorial (Si Necesario)
- Si `resultados < 3`: consulta `/api/search-semantic-products`
- **FILTRADO ESTRICTO:** Descartar productos que NO pertenecen al rubro
- Deduplicación por ID

**Consola de Descarte:**
```
🚫 Descartado: "Taladro Black+Decker" (rubro: Electrónica), esperado: "Ferretería"
```

---

## Flujo Completo

```
┌─────────────────────────────────────────┐
│  Búsqueda: "Mc Donald's"                │
└─────────────────────────────────────────┘
                  │
                  ▼
┌─────────────────────────────────────────┐
│  PASO 1: buscarNegocioDirecto()          │
│  - Buscar en negocios.nombre (ilike)    │
└─────────────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
      ENCONTRADO         NO ENCONTRADO
        │                   │
        ▼                   ▼
   ✅ Mostrar         CONTINUAR a PASO 2
      Perfil                │
      + Productos      ┌─────────────────────────────────────────┐
      DETENER          │  PASO 2: detectarRubroEstricto()        │
                       │  Método A: Match exacto en rubros       │
                       │  Método B: Palabras clave               │
                       │  Método C: Embedding (último recurso)   │
                       └─────────────────────────────────────────┘
                                  │
                        ┌─────────┴─────────┐
                        │                   │
                    ENCONTRADO         NO ENCONTRADO
                        │                   │
                        ▼                   ▼
                  CONTINUAR a         ❌ Sin Resultados
                  PASO 3              DETENER
                        │
      ┌─────────────────┴─────────────────┐
      │                                   │
      ▼                                   ▼
  ┌────────────────────────┐  ┌────────────────────────┐
  │  PASO 3A: Negocios     │  │  PASO 3B: Productos    │
  │  obtenerNegociosPor    │  │  obtenerProductosPor   │
  │  Rubro()               │  │  Rubro()               │
  └────────────────────────┘  └────────────────────────┘
                  │                    │
                  └────────┬───────────┘
                           │
                           ▼
         ┌─────────────────────────────────┐
         │  ¿Hay productos?                │
         └─────────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
       SÍ                  NO
        │                   │
        ▼                   ▼
   Mostrar            ¿Hay Negocios?
   Productos             │
        │          ┌──────┴──────┐
        │          │             │
        │         SÍ            NO
        │          │             │
        │          ▼             ▼
        │     Mostrar        "Sin
        │     Negocios       Resultados"
        │          │
        └──────────┼──────────┐
                   │          │
                   ▼          ▼
            ✅ Renderizar   ✅ Navegación
               Resultados      Correcta
```

---

## Cambios en el Código

### `src/services/searchService.js`

**Funciones Nuevas:**

1. **`buscarNegocioDirecto(term)`** (60 líneas)
   - Búsqueda simple ilike en negocios
   - Retorna primer negocio o null

2. **`detectarRubroEstricto(term)`** (80 líneas)
   - 3 métodos secuenciales para detectar rubro
   - Retorna objeto rubro con `metodo` y `similarity`
   - **NO** inferencia desde productos

3. **`obtenerNegociosPorRubro(rubro)`** (30 líneas)
   - Búsqueda exacta en `negocios.rubro`
   - Retorna array de negocios

4. **`obtenerProductosPorRubro(term, rubro)`** (70 líneas)
   - Sub-paso A: ilike en productos del rubro
   - Sub-paso B: vectorial filtrado por rubro
   - Deduplicación automática
   - **Filtrado estricto:** descarta productos de otros rubros

**Funciones Refactorizadas:**

- `searchProductos()`: Mantiene lógica de texto (sin cambios de interfaz)
- `searchProductosSemantic()`: Mantiene lógica de semántica
- `searchNegociosByRubro()`, `searchNegociosByNombre()`: Compatibilidad

---

### `src/main.js`

**Función Reescrita:**

**`performSearch()`** (150 líneas → arquitectura clara)
```javascript
async function performSearch() {
  // PASO 1: Buscar negocio directo
  const negocioDirecto = await buscarNegocioDirecto(searchTerm);
  if (negocioDirecto) {
    // Mostrar perfil + productos del negocio
    return; // DETENER
  }

  // PASO 2: Detectar rubro
  const rubro = await detectarRubroEstricto(searchTerm);
  if (!rubro) {
    showNoResults(); // Fallo total
    return;
  }

  // PASO 3: Obtener contenido del rubro
  const negocios = await obtenerNegociosPorRubro(rubro.nombre);
  const productos = await obtenerProductosPorRubro(searchTerm, rubro.nombre);

  // Presentación
  if (productos.length > 0) {
    renderProductos(productos);
    if (negocios.length > 0) {
      // "También podrías encontrarlo en..."
    }
  } else if (negocios.length > 0) {
    renderNegocios(negocios);
  } else {
    showNoResults();
  }
}
```

**Importaciones Nuevas:**
```javascript
import { buscarNegocioDirecto, detectarRubroEstricto, obtenerNegociosPorRubro, obtenerProductosPorRubro, ... }
```

---

## Garantías de Coherencia

| Escenario | Comportamiento |
|-----------|----------------|
| Usuario busca "Mc Donald's" (negocio específico) | PASO 1: Mostrar perfil de Mc Donald's + menú |
| Usuario busca "Hamburguesa" (producto en múltiples rubros) | PASO 2: Detectar rubro "Comida" → PASO 3: Productos de Comida |
| Usuario busca "Ferramenta rara" (término desconocido) | PASO 2: Fallar en A, B y C → "Sin resultados" (NO especular) |
| Resultado vectorial de otro rubro accidental | PASO 3B: Filtro automático descarta (consola muestra por qué) |
| Base de datos con producto mal categorizado | PASO 3B: Descartado automáticamente (no contamina búsqueda) |

---

## Console Logs de Diagnóstico

Cada búsqueda genera trazas claras:

```
========== 🔍 BÚSQUEDA JERÁRQUICA TOP-DOWN: "Hamburguesa" ==========

1️⃣  PASO 1: Buscando negocio directo por nombre...
❌ PASO 1 FALLIDO: No es un negocio específico

2️⃣  PASO 2: Detectando Rubro (Fuente de la Verdad)...
  → Método A: Match exacto en rubros...
✅ PASO 2 ÉXITO (Método B): Rubro inferido desde keywords: "Comida"

3️⃣  PASO 3: Recuperando contenido scopeado al rubro "Comida"...
  → Negocios encontrados: 12
  → Productos encontrados: 45

🎨 PRESENTACIÓN:
  → Renderizando 45 producto(s) del rubro
  → Agregando 12 negocio(s) como "También podrías encontrarlo en..."
```

---

## Testing Recomendado

```javascript
// Caso 1: Negocio Específico
window.performSearch("Mc Donald's")
// Esperado: PASO 1 ÉXITO → Perfil + Menú

// Caso 2: Producto en Rubro Conocido
window.performSearch("Hamburguesa")
// Esperado: PASO 2 ÉXITO (Método B) → Comida

// Caso 3: Rubro Directo
window.performSearch("Ferretería")
// Esperado: PASO 2 ÉXITO (Método A) → Ferreterías

// Caso 4: Término Vago + Semántica
window.performSearch("Tengo hambre")
// Esperado: PASO 2 ÉXITO (Método C) → Comida

// Caso 5: Término Desconocido
window.performSearch("Foosdfösöfsfödföfö")
// Esperado: PASO 2 FALLIDO → "Sin resultados"
```

---

## Beneficios de Esta Arquitectura

✅ **Coherencia Garantizada:** Nunca hay inferencia inversa  
✅ **Eficiencia:** Detención temprana si se encuentra negocio  
✅ **Escalabilidad:** Métodos de detección desacoplados  
✅ **Debuggabilidad:** Console logs claros en cada paso  
✅ **Maintainibilidad:** Responsabilidades separadas por función  
✅ **Robustez:** Filtrado automático de datos mal categorizados  

---

## Transición desde Arquitectura Anterior

**Eliminado:**
- Función `detectarRubro()` (reemplazada por `detectarRubroEstricto()`)
- Función `buscarProductosPorRubro()` (reemplazada por `obtenerProductosPorRubro()`)
- Lógica de "inferencia de negocios" desde productos
- Función `filterByRelevance()` (ya no es necesaria)

**Mantenido para Compatibilidad:**
- `searchProductos()`, `searchProductosSemantic()`
- `searchNegociosByRubro()`, `searchNegociosByNombre()`
- `searchPalabrasClave()`, `searchSemantic()`

**Nuevo:**
- `buscarNegocioDirecto()` 
- `detectarRubroEstricto()`
- `obtenerNegociosPorRubro()`
- `obtenerProductosPorRubro()`
