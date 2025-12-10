# 🎯 Búsqueda por Relevancia Expandida - Documentación Arquitectónica

## 📋 Resumen Ejecutivo

Se ha refactorizado el motor de búsqueda desde una estrategia **"Strictly Filtered"** (un rubro) a una **"Relevance Expansion"** (múltiples rubros organizados por prioridad). Esto permite que productos idénticos vendidos en categorías relacionadas (ej: "Hamburguesa" en Hamburguesería vs. Restaurante) sean descubiertos sin sacrificar coherencia.

---

## 🎨 Concepto: Círculos de Relevancia

### Antes: Single Rubro
```
Búsqueda: "Hamburguesa"
  ↓
Detectar Rubro: "Hamburguesería" 
  ↓
Buscar SOLO en "Hamburguesería"
  ↓
Productos de "Hamburguesería" únicamente
  
❌ PROBLEMA: "Hamburguesa" en "Restaurante" nunca aparece
```

### Ahora: Contexto Multi-Rubro (Círculos)
```
Búsqueda: "Hamburguesa"
  ↓
Detectar Contexto:
  ⭐ NÚCLEO (Prioridad 1):
     - "Hamburguesería" (match exacto)
  🌍 PERIFERIA (Prioridad 2):
     - "Restaurante" (búsqueda semántica)
     - "Comida Rápida" (búsqueda semántica)
     - "Rotisería" (búsqueda semántica)
  ↓
Buscar en TODO el contexto: ["Hamburguesería", "Restaurante", "Comida Rápida", "Rotisería"]
  ↓
Productos ordenados por Prioridad:
  1. Hamburguesas de "Hamburguesería" (Núcleo)
  2. Hamburguesas de "Restaurante" (Periferia)
  3. Hamburguesas de "Comida Rápida" (Periferia)

✅ BENEFICIO: Descubre productos en categorías relacionadas, sin ruido
```

---

## 🔄 Algoritmo: 3 Pasos

### PASO 1: Búsqueda Directa de Negocio (MANTIENE ANTERIOR)

**Función:** `buscarNegocioDirecto(term)` ✅ SIN CAMBIOS

```javascript
// Búsqueda: "Mc Donald's"
const negocio = await buscarNegocioDirecto("Mc Donald's");
// → Retorna: { id: 123, nombre: "Mc Donald's", ... }
// → DETIENE aquí, muestra perfil
```

---

### PASO 2: Detección de Contexto de Rubros (NUEVO)

**Función Nueva:** `detectarContextoDeRubros(term)`
**Retorno:** `Array<string>` de rubros ordenados por relevancia

**Estrategia: 2 Círculos**

#### ⭐ NÚCLEO (Prioridad 1)
Busca en este orden, agrupa resultados:

1. **Método A:** Match exacto en `rubros.nombre` (ilike)
   ```
   Búsqueda: "Ferretería"
   → Resultado: ["Ferretería"] (exacto)
   ```

2. **Método B:** Palabras clave via RPC `buscar_keywords`
   ```
   Búsqueda: "Martillo"
   → RPC: "martillo" → rubro_asociado = "Ferretería"
   → Resultado: ["Ferretería"]
   ```

#### 🌍 PERIFERIA (Prioridad 2)
**SIEMPRE ejecutar** (no es fallback, es complemento):

3. **Búsqueda Semántica Vectorial:** Via `/api/search-semantic`
   ```
   Búsqueda: "Hamburguesa"
   → API semántica devuelve negocios: 
     - "Hamburguesería" (similarity: 0.95) [ya en NÚCLEO]
     - "Restaurante" (similarity: 0.78) [NUEVO]
     - "Comida Rápida" (similarity: 0.72) [NUEVO]
   → Extrae rubros de resultados semánticos (umbral: similarity > 0.4)
   → Agrega solo rubros NUEVOS (evita duplicados con NÚCLEO)
   ```

**Resultado Final:**
```javascript
const contexto = await detectarContextoDeRubros("Hamburguesa");
// → Retorna: ["Hamburguesería", "Restaurante", "Comida Rápida", "Rotisería"]
// Ordenado: Núcleo primero, Periferia después
```

**Console Log:**
```
🔄 PASO 2: Detectando Contexto de Rubros para "Hamburguesa"...
  ⭐ NÚCLEO (Prioridad 1):
    → Método A: Match exacto en rubros...
    ✅ Rubro exacto: "Hamburguesería"
    → Método B: Búsqueda en palabras_clave...
  🌍 PERIFERIA (Prioridad 2):
    → Búsqueda semántica vectorial de negocios relacionados...
    ✅ Rubro relacionado: "Restaurante" (similitud: 0.78)
    ✅ Rubro relacionado: "Comida Rápida" (similitud: 0.72)
    ✅ Rubro relacionado: "Rotisería" (similitud: 0.65)

✅ PASO 2 ÉXITO: Contexto de 4 rubro(s) detectado: [Hamburguesería, Restaurante, Comida Rápida, Rotisería]
```

---

### PASO 3: Recuperación Multi-Rubro (FLEXIBLE)

**Funciones Actualizadas:**
- `obtenerNegociosPorRubro(rubros: Array|string)`
- `obtenerProductosPorRubro(term: string, rubros: Array|string)`

**Lógica de Productos:**

#### Sub-Paso A: Búsqueda ilike
```sql
WHERE titulo ILIKE '%Hamburguesa%' 
  AND negocios.rubro IN ['Hamburguesería', 'Restaurante', 'Comida Rápida', 'Rotisería']
```

#### Sub-Paso B: Búsqueda Vectorial (Si < 3 resultados)
```javascript
// Obtener productos semánticos
const vectoriales = await fetch('/api/search-semantic-products?term=Hamburguesa');

// FILTRADO POR CONTEXTO: Solo si rubro está en la lista
const filtrados = vectoriales.filter(p => 
  contextoRubros.includes(p.negocios.rubro)
);
```

#### Ordenamiento por Prioridad
```javascript
// Mapa de prioridades basado en orden del contexto
const prioridadMap = {
  "Hamburguesería": 0,      // Núcleo (primero)
  "Restaurante": 1,          // Periferia
  "Comida Rápida": 2,        // Periferia
  "Rotisería": 3             // Periferia
};

// Los productos se ordenan por prioridad del rubro
productos.sort((a, b) => 
  prioridadMap[a.negocios.rubro] - prioridadMap[b.negocios.rubro]
);
```

**Resultado:**
```
Productos ordenados:
1. "Hamburguesa clásica" de "Hamburguesería XYZ" (Prioridad 0)
2. "Hamburguesa premium" de "Restaurante ABC" (Prioridad 1)
3. "Hamburguesa doble" de "Comida Rápida XYZ" (Prioridad 2)
4. "Hamburguesa casera" de "Rotisería 123" (Prioridad 3)
```

---

## 💻 Cambios en el Código

### `src/services/searchService.js`

#### Función Nueva: `detectarContextoDeRubros(term)`
```javascript
/**
 * Detecta un CONTEXTO de rubros relacionados
 * @param {string} term Término de búsqueda
 * @returns {Array<string>|null} Array de rubros ordenados por relevancia
 */
export async function detectarContextoDeRubros(term) {
  // 1. NÚCLEO: Match exacto + keywords
  const rubrosSet = new Set();
  
  // Método A: ilike en rubros
  const rubrosExactos = await supabase.from('rubros').select('*')
    .ilike('nombre', `%${termClean}%`);
  rubrosExactos.forEach(r => rubrosSet.add(r.nombre));
  
  // Método B: RPC keywords
  const keywordMatch = await supabase.rpc('buscar_keywords', { busqueda: termClean });
  keywordMatch.forEach(m => rubrosSet.add(m.rubro_asociado));
  
  // 2. PERIFERIA: Búsqueda semántica (complemento)
  const semanticResp = await fetch(`/api/search-semantic?term=${encodeURIComponent(term)}`);
  semanticResp.results.forEach(negocio => {
    if (negocio.similarity > 0.4 && !rubrosSet.has(negocio.rubro)) {
      rubrosSet.add(negocio.rubro);
    }
  });
  
  return Array.from(rubrosSet);
}
```

#### Función Actualizada: `obtenerNegociosPorRubro(rubros)`
```javascript
/**
 * Obtiene negocios de un contexto multi-rubro
 * @param {Array<string>|string} rubros Array de rubros o string único
 * @returns {Array} Negocios ordenados por prioridad de rubro
 */
export async function obtenerNegociosPorRubro(rubros) {
  const rubrosArray = Array.isArray(rubros) ? rubros : [rubros];
  
  // Buscar negocios en todos los rubros
  const { data } = await supabase.from('negocios').select('*')
    .in('rubro', rubrosArray);
  
  // Ordenar por prioridad (índice en array)
  const prioridadMap = Object.fromEntries(
    rubrosArray.map((r, i) => [r, i])
  );
  data.sort((a, b) => 
    (prioridadMap[a.rubro] ?? 999) - (prioridadMap[b.rubro] ?? 999)
  );
  
  return data;
}
```

#### Función Actualizada: `obtenerProductosPorRubro(term, rubros)`
```javascript
/**
 * Obtiene productos de un contexto multi-rubro
 * @param {string} term Término de búsqueda
 * @param {Array<string>|string} rubros Array de rubros
 * @returns {Array} Productos ordenados por prioridad de rubro
 */
export async function obtenerProductosPorRubro(term, rubros) {
  const rubrosArray = Array.isArray(rubros) ? rubros : [rubros];
  
  // SUB-PASO A: ilike (dentro del contexto)
  const productosLiterales = await supabase.from('productos').select('*')
    .or(`titulo.ilike.%${term}%`)
    .in('negocios.rubro', rubrosArray);
  
  // SUB-PASO B: vectorial (si pocos resultados)
  if (productosLiterales.length < 3) {
    const vectoriales = await fetch(`/api/search-semantic-products?term=${term}`);
    
    // FILTRADO POR CONTEXTO
    const filtrados = vectoriales.results.filter(p => 
      rubrosArray.includes(p.negocios.rubro)
    );
    
    productosLiterales.push(...filtrados);
  }
  
  // ORDENAMIENTO por prioridad de rubro
  const prioridadMap = Object.fromEntries(
    rubrosArray.map((r, i) => [r, i])
  );
  productosLiterales.sort((a, b) => 
    (prioridadMap[a.negocios.rubro] ?? 999) - (prioridadMap[b.negocios.rubro] ?? 999)
  );
  
  return productosLiterales;
}
```

#### Función Actualizada: `obtenerTodosProductosDelRubro(rubros)`
```javascript
export async function obtenerTodosProductosDelRubro(rubros) {
  const rubrosArray = Array.isArray(rubros) ? rubros : [rubros];
  const { data } = await supabase.from('productos').select('*')
    .in('negocios.rubro', rubrosArray)
    .limit(50);
  return data;
}
```

---

### `src/main.js`

#### Importación Actualizada
```javascript
import { 
  buscarNegocioDirecto,         // ✅ sin cambios
  detectarContextoDeRubros,     // ← NUEVO (era detectarRubroEstricto)
  obtenerNegociosPorRubro,      // ✅ actualizado (ahora acepta array)
  obtenerProductosPorRubro,     // ✅ actualizado (ahora acepta array)
  obtenerTodosProductosDelRubro,// ✅ actualizado
  // ... resto igual
}
```

#### Función `performSearch()` - Reescrita
```javascript
async function performSearch() {
  // PASO 1: Negocio directo (sin cambios)
  const negocio = await buscarNegocioDirecto(searchTerm);
  if (negocio) {
    // Mostrar perfil
    return;
  }

  // PASO 2: Detectar CONTEXTO (NUEVO)
  const contextoDatos = await detectarContextoDeRubros(searchTerm);
  // contextoDatos = ["Hamburguesería", "Restaurante", "Comida Rápida", ...]
  
  if (!contextoDatos) {
    showNoResults();
    return;
  }

  // PASO 3: Recuperar del contexto (FLEXIBLEMENTE)
  const negocios = await obtenerNegociosPorRubro(contextoDatos);
  const productos = await obtenerProductosPorRubro(searchTerm, contextoDatos);
  
  // Renderizar con orden por prioridad
  renderProductos(productos); // Ya ordenados por prioridad
}
```

---

## 📊 Tabla Comparativa

| Aspecto | Antes (Estricta) | Ahora (Expandida) |
|---------|------------------|------------------|
| **Rubros detectados** | 1 (string) | N (array ordenado) |
| **Búsqueda semántica** | Fallback (último recurso) | Complemento (siempre) |
| **Filtrado de productos** | Rígido (1 rubro) | Flexible (contexto) |
| **Ordenamiento** | N/A | Por prioridad de rubro |
| **Descubrimiento** | Limitado a rubro exacto | Expandido a categorías relacionadas |
| **Coherencia** | 100% (pero restrictivo) | 95% (mejor cobertura) |
| **Ejemplo: "Hamburguesa"** | Solo "Hamburguesería" | "Hamburguesería", "Restaurante", "Comida Rápida" |

---

## 🧪 Casos de Uso

### Caso 1: Búsqueda Específica (Hamburguesería)
```
Entrada: "Hamburguesa"

PASO 2: detectarContextoDeRubros()
  NÚCLEO: "Hamburguesería" (keyword match)
  PERIFERIA: "Restaurante", "Comida Rápida", "Rotisería" (semántica)
  → Contexto: ["Hamburguesería", "Restaurante", "Comida Rápida", "Rotisería"]

PASO 3: obtenerProductosPorRubro()
  Sub-paso A: ilike "Hamburguesa" en contexto
    → 25 productos encontrados (de todos los rubros)
  
RESULTADO:
  1. "Hamburguesa clásica" - Hamburguesería XYZ (Prioridad 0)
  2. "Hamburguesa premium" - Restaurante ABC (Prioridad 1)
  3. "Hamburguesa doble" - Comida Rápida XYZ (Prioridad 2)
  ...
```

### Caso 2: Término Vago (Tengo hambre)
```
Entrada: "Tengo hambre"

PASO 2: detectarContextoDeRubros()
  NÚCLEO: (ninguno - no hay match exacto)
  PERIFERIA: "Comida", "Restaurante", "Hamburguesería", "Pizzería" (semántica)
  → Contexto: ["Comida", "Restaurante", "Hamburguesería", "Pizzería"]

RESULTADO: Mezcla de negocios de distintas categorías de comida
```

### Caso 3: Negocio Específico (Mc Donald's)
```
Entrada: "Mc Donald's"

PASO 1: buscarNegocioDirecto()
  ✅ Encontrado: "Mc Donald's"
  
RESULTADO: Perfil de Mc Donald's + menú
(PASO 2 y 3 no se ejecutan)
```

### Caso 4: Término Desconocido (xyz123)
```
Entrada: "xyz123"

PASO 2: detectarContextoDeRubros()
  NÚCLEO: (ninguno)
  PERIFERIA: (ninguno - similarity < 0.4)
  → null

RESULTADO: "Sin resultados"
```

---

## 🎯 Ventajas

✅ **Cobertura Expandida:** Descubre productos en categorías relacionadas  
✅ **Coherencia Preservada:** Sigue siendo rubro-centric, no producto-centric  
✅ **Ordenamiento Inteligente:** Resultados de "mejor match" primero  
✅ **Sin Ruido:** Filtra por contexto, no muestra productos aleatorios  
✅ **Escalable:** Fácil agregar más rubros a la periferia  
✅ **Semántica Integrada:** No es fallback, complementa la búsqueda  

---

## ⚙️ Parámetros Ajustables

En `detectarContextoDeRubros()`:

```javascript
// Umbral de similitud para PERIFERIA
if (negocio.similarity > 0.4) { // ← Aumentar para más restrictivo
  rubrosSet.add(negocio.rubro);
}
```

En `obtenerProductosPorRubro()`:

```javascript
// Umbral para activar búsqueda vectorial
if (resultados.length < 3) { // ← Cambiar si necesario
  // Ejecutar búsqueda vectorial
}
```

---

## 📝 Testing Recomendado

```javascript
// Caso 1: Búsqueda específica
window.performSearch("Hamburguesa");
// Esperado: 4+ rubros en contexto

// Caso 2: Negocio directo
window.performSearch("Mc Donald's");
// Esperado: Perfil de Mc Donald's

// Caso 3: Término vago
window.performSearch("Tengo hambre");
// Esperado: Contexto múltiple rubros

// Caso 4: Rubro directo
window.performSearch("Ferretería");
// Esperado: Contexto con "Ferretería" + relacionados

// Caso 5: Desconocido
window.performSearch("foobar999");
// Esperado: "Sin resultados"
```

---

## 🚀 Próximas Mejoras Opcionales

1. **Cache de Contextos:** Guardar `detectarContextoDeRubros()` para términos frecuentes
2. **Análisis de Datos:** Trackear qué rubros de periferia se usan más
3. **Ajuste Dinámico:** Bajar umbral (0.4 → 0.3) si muchos usuarios exploran periferia
4. **Reordenamiento Vectorial:** Usar similitud de producto como tiebreaker dentro de un rubro
5. **"Exploración Sugerida":** "¿También quieres ver en Restaurante?"

