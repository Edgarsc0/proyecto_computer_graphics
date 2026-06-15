# Especificación Técnica: Sistema de Mapeo Cartográfico Local e Interactivo (Next.js + SVG)

Este documento contiene los fundamentos matemáticos, el conjunto de datos iniciales y los requerimientos funcionales para construir una aplicación web interactiva utilizando **Next.js (React)** con **JavaScript puro (ES6+)**. El objetivo del sistema es proyectar coordenadas geográficas reales (WGS84) en un lienzo bidimensional SVG de forma isótropa y conforme localmente, además de permitir la edición y consulta de entidades geométricas (edificios).

---

## 1. Fundamentos Matemáticos y Transformación $T$

El sistema asume una aproximación local de la superficie terrestre como un espacio euclídeo plano mediante el uso de la métrica de la esfera en el entorno del campus. Esto es formalmente válido debido a que el área de estudio es pequeña ($\approx 10^{-4}$ radianes) y los términos de curvatura de orden superior son despreciables.

### 1.1 Definición de los Espacios Coordenados
* **Espacio Geográfico ($\Omega_G$):** Dominios acotados de longitud ($\beta$) y latitud ($\alpha$).
    $$\Omega_G = [\beta_{\min}, \beta_{\max}] \times [\alpha_{\min}, \alpha_{\max}]$$
* **Espacio SVG ($\Omega_{SVG}$):** Dominios discretos de la trama de pantalla definidos por el `viewBox`.
    $$\Omega_{SVG} = [0, W] \times [0, H]$$

### 1.2 Constantes del Bounding Box Geográfico
Los límites absolutos que encierran el campus escolar están definidos por los siguientes valores fijos:
* **Latitud Máxima ($\alpha_{\max}$):** `19.506085642577684`
* **Latitud Mínima ($\alpha_{\min}$):** `19.501672871991357`
* **Longitud Máxima ($\beta_{\max}$):** `-99.14538442387669`
* **Longitud Mínima ($\beta_{\min}$):** `-99.14882990272824`

### 1.3 Condición de Isotropía (Aspect Ratio)
Para evitar distorsiones métricas y asegurar que un metro en el eje vertical equivalga exactamente a un metro en el eje horizontal, las dimensiones del lienzo $W$ y $H$ deben respetar la relación de aspecto real del terreno modificada por el coseno de la latitud media.

Dados:
* $\Delta \alpha = \alpha_{\max} - \alpha_{\min} = 0.004412770586327^\circ$
* $\Delta \beta = \beta_{\max} - \beta_{\min} = 0.003445478851546^\circ$
* $\alpha_0 = \frac{\alpha_{\max} + \alpha_{\min}}{2} = 19.50387925728452^\circ$ (Latitud central)

Fijando un ancho nominal **$W = 1000$**, la altura **$H$** se calcula estrictamente mediante:
$$H = W \cdot \frac{\Delta \alpha}{\Delta \beta \cdot \cos(\alpha_{0\text{rad}})} \approx 1358.71$$

Por lo tanto, el contenedor gráfico debe inicializarse obligatoriamente con: `viewBox="0 0 1000 1358.71"`.

### 1.4 Ecuaciones de la Transformación $T(\beta, \alpha) \to (x, y)$
La función de mapeo biyectiva implementada en el código frontend debe aplicar los siguientes factores de escala lineales:

$$x(\beta) = (\beta - \beta_{\min}) \cdot \left(\frac{W}{\Delta \beta}\right) = (\beta + 99.14882990272824) \cdot 290235.42109$$

$$y(\alpha) = (\alpha_{\max} - \alpha) \cdot \left(\frac{H}{\Delta \alpha}\right) = (19.506085642577684 - \alpha) \cdot 307899.73467$$

---

## 2. Dataset Estático Inicial (Código SVG Base)

El agente debe pre-cargar los siguientes elementos geométricos estructurados perimetralmente en el estado de la aplicación:

```xml
<polygon points="0,1120.2 524.03,0 1000,224.36 502.68,1358.71" fill="#e9ecef" stroke="#ced4da" stroke-dasharray="5,5" />

<polygon id="edificio-1" points="387.25,556.19 461.4,396.41 517.64,423.27 503.04,452.85 483.58,444.29 422.04,573.99" fill="#5c7cfa" stroke="#364fc7" stroke-width="2" />

<polygon id="edificio-2" points="464.69,389.27 540.4,230.07 573.48,246.23 505.86,397.52" fill="#ff922b" stroke="#d9480f" stroke-width="2" />

<polygon id="edificio-3" points="490.26,539.61 562.71,389.7 626.25,420.04 557.0,570.66" fill="#51cf66" stroke="#2b8a3e" stroke-width="2" />

<polygon id="puente" points="544.26,427.5 501.45,406.29 505.73,397.72 549.13,418.16" fill="#fcc419" stroke="#e67e22" stroke-width="1.5" />

3. Arquitectura del Componente de Next.js

Se requiere construir un dashboard SPA (Single Page Application) utilizando exclusivamente JavaScript (JS) heredado de estándares modernos (ES6+), dividido en dos secciones principales: el Lienzo del Mapa (interfaz interactiva SVG) y el Panel de Control Lateral (formularios y lectura de datos).
3.1 Estado de la Aplicación (React.useState)

    buildings: Un esquema de datos basado en arreglos de objetos estándar de JavaScript para representar los polígonos:
    JavaScript

    // Estructura de referencia de cada elemento del estado
    {
      id: "edificio-1",
      name: "Edificio 1",
      color: "#5c7cfa",
      rawCoordinates: [ [19.504279249865437, -99.14749565391917], ... ], // Matriz conteniendo [lat, lon]
      svgPoints: "387.25,556.19 461.4,396.41 517.64,423.27..."          // String mapeado para la etiqueta
    }

    userMarker: Almacena la posición simulada por el usuario en formato de arreglo [lat, lon], inicializado como null.

    selectedVertex: Almacena un objeto con la información del vértice activo al hacer clic, inicializado como null:
    JavaScript

    { edificioId: "edificio-1", index: 0, lat: 19.50427, lon: -99.14749, x: 387.25, y: 556.19 }

4. Requerimientos Funcionales Computacionales
Módulo A: Simulador de Ubicación GPS en Tiempo Real

    Interfaz: Dos campos numéricos de entrada (<input type="number">) titulados Latitud y Longitud, junto a un botón de renderizado.

    Procesamiento: Al presionar el botón, el sistema ejecuta la función de transformación lineal T(β,α) utilizando las ecuaciones definidas.

    Comportamiento Gráfico: Si el resultado (x,y) se encuentra dentro de los límites del viewBox, se renderiza una etiqueta <circle cx={x} cy={y} r="8" fill="red" /> que simula la posición actual del usuario en la pantalla.

Módulo B: Inspector de Vértices y Metadatos

    Interfaz: Un modal o sección dinámica en el panel que muestre las coordenadas del objeto seleccionado.

    Interacción: 1. El usuario debe poder hacer clic sobre cualquier polígono del mapa o sobre marcadores circulares pequeños (<circle>) posicionados sobre cada vértice de los edificios.
    2. Al detonar el evento onClick, se calcula y actualiza el estado para imprimir en pantalla:

        Nombre de la estructura seleccionada.

        Índice correlativo del vértice cliqueado.

        Coordenadas geodésicas puras de origen: (Latitud, Longitud).

        Coordenadas transformadas en píxeles locales de la pantalla: (X, Y).

Módulo C: Inyección Dinámica de Nuevas Entidades (Agregar Edificios)

    Interfaz: Un formulario estructurado que permita al usuario ingresar de forma asíncrona:

        Nombre de la nueva estructura (ej. "Edificio 4").

        Color del relleno (vía text input o selector de color nativo HTML5).

        Un área de texto o lista dinámica de entradas donde se listen los vértices en formato plano Latitud, Longitud (uno por fila).

    Procesamiento: 1. Al guardar el formulario, la lógica itera sobre las cadenas de caracteres de entrada.
    2. Parsea y limpia los datos para pasarlos por las ecuaciones de transformación de JavaScript.
    3. Formatea la salida generando un string de tipo "x1,y1 x2,y2 ... xN,yN".
    4. Agrega el nuevo objeto plano al arreglo buildings del estado dinámico.

    Comportamiento Gráfico: React detectará la mutación de estado y re-renderizará de forma síncrona el mapa inyectando un nuevo componente del DOM virtual: <polygon key={id} points={svgPoints} ... />.

5. Criterios de Validación Técnica para el Agente

    Restricción de Lenguaje: Queda estrictamente prohibido el uso de tipado fuerte, interfaces, tipados genéricos o archivos de configuración TypeScript (.ts, .tsx). El proyecto se estructurará puramente en archivos de código fuente JavaScript (.js, .jsx).

    Conversión Angular: Asegurar que la función Math.cos() nativa del objeto matemático de JavaScript reciba el ángulo convertido explícitamente a radianes (grados * Math.PI / 180).

    Inversión del Eje Y: Validar que la ecuación del componente y reste el valor de entrada a la latitud máxima (αmax​−α) para contrarrestar la orientación nativa descendente del canvas SVG.

    Seguridad y Control de Errores: Validar que las funciones de parsing en el Módulo C limpien espacios en blanco excesivos (.trim()), descarten filas vacías y manejen excepciones (try/catch) en caso de que el usuario provea caracteres no numéricos.
