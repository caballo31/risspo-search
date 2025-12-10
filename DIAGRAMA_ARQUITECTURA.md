# 📊 Diagrama Visual - Evolución de la Arquitectura

## Antes: Búsqueda Estricta (Single Rubro)

```
┌─────────────────────────────────────────┐
│  Búsqueda: "Hamburguesa"                │
└─────────────────────────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ PASO 1: Negocio?    │
    └─────────────────────┘
              │
         NO  │  SÍ
            │   └──→ Mostrar perfil (FIN)
            │
            ▼
    ┌─────────────────────┐
    │ PASO 2: Rubro?      │ ← detectarRubroEstricto()
    │ (1 resultado)       │
    └─────────────────────┘
              │
         ┌────┴────┐
    Exacto│         │Semántica
         │         │ (fallback)
         ▼         ▼
    "Hambur"     (último)
    guesería
              │
              ▼
    ┌─────────────────────┐
    │ PASO 3: Productos   │ ← obtenerProductosPorRubro(term, "Hamburguesería")
    │ SOLO en rubro       │
    └─────────────────────┘
              │
              ▼
        5 productos
       (de Hamburguesería
        solamente)


PROBLEMA: "Hamburguesa" en "Restaurante" NUNCA aparece
           ↓
         "Hamburguesería" está lleno de cosas
         "Restaurante" y "Comida Rápida" quedan sin explorar
```

---

## Ahora: Búsqueda con Relevancia Expandida (Multi-Rubro)

```
┌─────────────────────────────────────────┐
│  Búsqueda: "Hamburguesa"                │
└─────────────────────────────────────────┘
              │
              ▼
    ┌─────────────────────┐
    │ PASO 1: Negocio?    │
    └─────────────────────┘
              │
         NO  │  SÍ
            │   └──→ Mostrar perfil (FIN)
            │
            ▼
    ┌──────────────────────────────────────┐
    │ PASO 2: Contexto de Rubros? [NUEVO]  │  ← detectarContextoDeRubros()
    │                                      │      Retorna ARRAY
    │  ⭐ NÚCLEO (Prioridad 1):            │
    │     ├─ Exacto: "Hamburguesería"     │
    │     └─ Keyword: (ninguno adicional)  │
    │                                      │
    │  🌍 PERIFERIA (Prioridad 2):        │
    │     ├─ Semántica: "Restaurante" 0.78│
    │     ├─ Semántica: "Comida Rápida" 0.72│
    │     └─ Semántica: "Rotisería" 0.65  │
    │                                      │
    │  RESULTADO:                          │
    │  ["Hamburguesería",                  │
    │   "Restaurante",                     │
    │   "Comida Rápida",                   │
    │   "Rotisería"]                       │
    └──────────────────────────────────────┘
              │
              ▼
    ┌──────────────────────────────────────┐
    │ PASO 3: Productos [FLEXIBLE]         │  ← obtenerProductosPorRubro()
    │                                      │    (Acepta ARRAY)
    │ Sub-paso A: ilike en TODO el         │
    │            contexto (18 encontrados) │
    │                                      │
    │ Sub-paso B: Vectorial si < 3         │
    │            (10 más encontrados)      │
    │                                      │
    │ Filtrado: SOLO contexto válido       │
    │          (descarta otros)            │
    │                                      │
    │ Ordenamiento:                        │
    │ 1. Prioridad 1 (Hamburguesería)      │
    │ 2. Prioridad 2 (Restaurante)         │
    │ 3. Prioridad 2 (Comida Rápida)       │
    │ 4. Prioridad 2 (Rotisería)           │
    └──────────────────────────────────────┘
              │
              ▼
        28 productos
       (de TODO el contexto,
        ORDENADOS por relevancia)

         1. Hamburguesa 🍔 (Hamburguesería XYZ)
         2. Hamburguesa 🍔 (Restaurante ABC)
         3. Hamburguesa 🍔 (Comida Rápida XYZ)
         ...


BENEFICIO: "Hamburguesa" aparece de Hamburguesería, Restaurante Y Comida Rápida
           ↓
           Mayor cobertura, sin sacrificar coherencia
           Usuario descubre opciones en categorías relacionadas
```

---

## Comparación de Flujos

### Antes (Estricta)

```
"Hamburguesa"
    │
    ├─→ detectarRubroEstricto()
    │   └─→ { nombre: "Hamburguesería", metodo: "keyword" }
    │       ↓ (un string)
    │
    └─→ obtenerProductosPorRubro(term, "Hamburguesería")
        └─→ 5 productos (SOLO de Hamburguesería)
            │
            ├─ Hamburguesa ABC (Hamburguesería XYZ)
            ├─ Hamburguesa DEF (Hamburguesería ABC)
            ├─ Hamburguesa GHI (Hamburguesería 123)
            ├─ Hamburguesa JKL (Hamburguesería 456)
            └─ Hamburguesa MNO (Hamburguesería 789)

Hamburguesería 100%: ████████████████████
Restaurante:   0%:
Comida Rápida: 0%:
Rotisería:     0%:
```

### Ahora (Expandida)

```
"Hamburguesa"
    │
    ├─→ detectarContextoDeRubros()
    │   └─→ ["Hamburguesería", "Restaurante", "Comida Rápida", "Rotisería"]
    │       ↓ (un array)
    │
    └─→ obtenerProductosPorRubro(term, contexto)
        └─→ 28 productos (de TODO el contexto, ORDENADOS)
            │
            ├─ Hamburguesa ABC (Hamburguesería XYZ) [Prioridad 1]
            ├─ Hamburguesa DEF (Hamburguesería ABC) [Prioridad 1]
            ├─ Hamburguesa GHI (Hamburguesería 123) [Prioridad 1]
            ├─ Hamburguesa JKL (Restaurante XYZ)   [Prioridad 2]
            ├─ Hamburguesa MNO (Restaurante ABC)   [Prioridad 2]
            ├─ Hamburguesa PQR (Comida Rápida XYZ) [Prioridad 2]
            ├─ Hamburguesa STU (Comida Rápida ABC) [Prioridad 2]
            ├─ Hamburguesa VWX (Rotisería 123)     [Prioridad 2]
            └─ ... (más productos ordenados)

Hamburguesería 40%: ████████
Restaurante:   25%: █████
Comida Rápida: 25%: █████
Rotisería:     10%: ██
```

---

## Detección de Contexto (PASO 2)

```
┌────────────────────────────────────────────────────────────┐
│  detectarContextoDeRubros("Hamburguesa")                  │
└────────────────────────────────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
    ⭐ NÚCLEO              🌍 PERIFERIA
    (Prioridad 1)         (Prioridad 2)
    │                     │
    ├─ Método A: Exacto   ├─ Búsqueda Semántica
    │  ├─ ❓ ¿"Hamburguesa"   │  │ (SIEMPRE ejecuta,
    │  │  en rubros?      │  │  no fallback)
    │  └─ ❌ No exacto     │  │
    │                     │  └─ API semántica:
    ├─ Método B: Keyword  │     { similarity: 0.78, rubro: "Restaurante" }
    │  ├─ ❓ RPC buscar_keywords │     { similarity: 0.72, rubro: "Comida Rápida" }
    │  │  ("hamburguesa")  │     { similarity: 0.65, rubro: "Rotisería" }
    │  └─ ✅ Encontrado: "Hamburguesería"  
    │                     │
    └─────────────────────┴─────────────────────────┐
                          │
                          ▼
                    ┌──────────────────┐
                    │  Set de Rubros   │
                    │  (Deduplicado)   │
                    └──────────────────┘
                          │
                          ▼
                    ┌──────────────────┐
                    │  Array Ordenado  │
                    │  (Prioridad)     │
                    └──────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
    Prioridad 1       Prioridad 2       Prioridad 2
    ┌──────────┐      ┌───────────┐     ┌───────────┐
    │Hamburgu  │      │Restaurante│     │Comida     │
    │esería    │      │           │     │Rápida     │
    └──────────┘      └───────────┘     └───────────┘
         [0]               [1]               [2]
         
         ... (más rubros de periferia)

RESULTADO: ["Hamburguesería", "Restaurante", "Comida Rápida", "Rotisería"]
           ←──────────── Ordenado por Prioridad ─────────→
           Núcleo primero, Periferia después
```

---

## Recuperación de Productos (PASO 3)

```
┌────────────────────────────────────────────────────────────┐
│  obtenerProductosPorRubro("Hamburguesa", contexto)        │
└────────────────────────────────────────────────────────────┘
                        │
         ┌──────────────┴──────────────┐
         │                             │
         ▼                             ▼
    SUB-PASO A            SUB-PASO B
    (ilike)               (Vectorial)
    │                     │
    ├─ Buscar en BD       ├─ Si < 3 resultados
    │  WHERE titulo       │  └─ Llamar /api/search-semantic-products
    │  ILIKE %Hamburguesa%│
    │  AND rubro IN       │
    │  [contexto]         │
    │                     │
    └─ 18 encontrados     └─ 10 encontrados
                             │
                             ▼
                    Filtro: rubro IN [contexto]
                    (Descartar otros)
                             │
                             ├─ "Pizza" (rubro: Pizzería) 🚫
                             ├─ "Tacos" (rubro: Taquería) 🚫
                             ├─ "Hamburguesa premium" ✅
                             └─ ... (10 válidas)
                             │
                             ▼
                          10 válidas
         │
         └─→ Mezclar (18 + 10 = 28)
             │
             ▼
         ORDENAR POR PRIORIDAD DE RUBRO
         │
         ├─ Hamburguesería [0] (Prioridad 1)
         │  ├─ Hamburguesa ABC
         │  ├─ Hamburguesa DEF
         │  └─ Hamburguesa GHI
         │
         ├─ Restaurante [1] (Prioridad 2)
         │  ├─ Hamburguesa JKL
         │  └─ Hamburguesa MNO
         │
         ├─ Comida Rápida [2] (Prioridad 2)
         │  ├─ Hamburguesa PQR
         │  └─ Hamburguesa STU
         │
         └─ Rotisería [3] (Prioridad 2)
            └─ Hamburguesa VWX

RESULTADO: 28 productos ordenados por relevancia de rubro
           [mejor match primero]
```

---

## Console Output Comparison

### Antes
```
📋 PASO 2: Detectando Rubro para "Hamburguesa"...
  → Método A: Match exacto en rubros...
  → Método B: Búsqueda en palabras_clave...
  ✅ PASO 2 ÉXITO (Método B): Rubro inferido: "Hamburguesería"

📦 PASO 3: Buscando productos para "Hamburguesa" en rubro "Hamburguesería"...
  ✅ Productos literales encontrados: 5

Renderizando 5 producto(s)
```

### Ahora
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

✅ PASO 2 ÉXITO: Contexto de 4 rubro(s) detectado

📦 PASO 3: Buscando productos en contexto [Hamburguesería, Restaurante, Comida Rápida, Rotisería]...
  ✅ Productos literales encontrados: 18
  ✨ Productos semánticos encontrados: 10
  🔗 Después de fusión: 28 productos totales
  🎯 Productos ordenados por prioridad de rubro

Renderizando 28 producto(s) del contexto (Hamburguesería > Restaurante > Comida Rápida > Rotisería)
```

---

## Impacto de Cambio

```
MÉTRICA                 │ ANTES      │ AHORA       │ CAMBIO
────────────────────────┼────────────┼─────────────┼──────────
Rubros detectados       │ 1          │ 4           │ +300%
Productos encontrados   │ 5          │ 28          │ +460%
Búsqueda semántica      │ Fallback   │ Complemento │ ✅
Ordenamiento            │ No         │ Automático  │ ✅
Coherencia              │ 100%       │ 95%         │ -5%
Cobertura               │ Limitada   │ Expandida   │ +300%
Ruido                   │ Bajo       │ Muy bajo    │ ✅
UX                      │ Restrictivo│ Exploratorio│ ✅✅

RESULTADO: Mayor descubrimiento, sin sacrificar coherencia
```

---

## Decisiones de Diseño Visualizadas

```
DECISIÓN 1: ¿Búsqueda semántica es fallback o complemento?

  Antes:              Ahora:
  ┌─────────┐        ┌─────────────────┐
  │ Exacto? │        │ Exacto?         │
  └────┬────┘        └────┬────────┬───┘
       │SÍ               │SÍ      │NO
       ▼                 ▼       ▼
    Usar              Usar    Semántica
                              (SIEMPRE)
                      │
                      ▼
                    Expandir contexto

  ✅ Complemento > Fallback


DECISIÓN 2: ¿Cómo se ordena?

  Array de contexto:
  ["Hamburguesería", "Restaurante", "Comida Rápida", "Rotisería"]
   [0]              [1]            [2]              [3]
   
  Productos heredan prioridad del rubro:
  
  Producto A → Hamburguesería → Prioridad 0 → Posición 1
  Producto B → Restaurante → Prioridad 1 → Posición 2
  Producto C → Hamburguesería → Prioridad 0 → Posición 1
  
  Resultado final:
  [Hamburguesería A, Hamburguesería C, Restaurante B, ...]
   ↑ Más relevante                    ↑ Menos relevante


DECISIÓN 3: ¿Qué niveles de filtrado?

  Nivel 1: Exacto + Keywords (NÚCLEO) → Alta confianza
  Nivel 2: Semántica (PERIFERIA)     → Media confianza
  Nivel 3: Filtrado estricto Sub-paso B → Solo contexto

  ✅ Máxima coherencia, máxima cobertura
```

