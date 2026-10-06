/**
 * MÓDULO: Método Simplex (tablas, con variables de holgura)
 * ------------------------------------------------------------
 * Resuelve problemas de MAXIMIZACIÓN con restricciones tipo ≤
 * y lado derecho no negativo — el mismo método clásico de tablas
 * (columna pivote, fila pivote, Gauss-Jordan) que se usó en clase.
 *
 * Entradas esperadas:
 *   objective = [60, 80]              // coeficientes de Z (ganancia por unidad)
 *   constraints = [
 *     { coeffs: [3, 5], rhs: 30 },    // 3x1 + 5x2 <= 30
 *     { coeffs: [2, 1], rhs: 10 },    // 2x1 + 1x2 <= 10
 *   ]
 *
 * Salida:
 *   {
 *     steps: [...]        // snapshot de la tabla en cada iteración (para mostrar en UI)
 *     xValues: [...]      // valor óptimo de cada variable de decisión
 *     slackValues: [...]  // valor de cada variable de holgura en el óptimo
 *     Z: number           // valor máximo de la función objetivo
 *     unbounded: bool     // true si el problema no tiene solución acotada
 *   }
 */

function solveSimplex(objective, constraints) {
  const n = objective.length;        // número de variables de decisión (x1, x2, ...)
  const m = constraints.length;      // número de restricciones (= número de holguras)
  const totalCols = n + m + 1;       // variables decisión + holguras + columna R

  // Nombres de columnas, para mostrarlos en la tabla de la interfaz
  const colNames = [];
  for (let i = 0; i < n; i++) colNames.push(`x${i + 1}`);
  for (let i = 0; i < m; i++) colNames.push(`s${i + 1}`);

  // 1. CONSTRUIR LA TABLA INICIAL (Tabla 1)
  // Cada fila de restricción: [coeficientes x], [identidad de holguras], [R]
  let tableau = constraints.map((c, i) => {
    const row = new Array(totalCols).fill(0);
    for (let j = 0; j < n; j++) row[j] = c.coeffs[j];
    row[n + i] = 1;           // 1 en su propia columna de holgura
    row[totalCols - 1] = c.rhs;
    return row;
  });

  // Fila Z: coeficientes de la función objetivo en negativo, resto en cero
  let zRow = new Array(totalCols).fill(0);
  for (let j = 0; j < n; j++) zRow[j] = -objective[j];

  // "basis[i]" indica qué variable es básica en la fila i (empieza con las holguras)
  let basis = [];
  for (let i = 0; i < m; i++) basis.push(n + i);

  const steps = [];
  const EPS = 1e-9;
  let unbounded = false;

  // Guardamos el estado inicial como el primer "paso" para mostrarlo en la UI
  steps.push(snapshotTabla(tableau, zRow, basis, colNames, null, null));

  // 2. ITERAR hasta que no haya negativos en la fila Z (condición de optimalidad)
  let iteraciones = 0;
  const MAX_ITERACIONES = 50; // salvaguarda para evitar bucles infinitos por algún dato raro

  while (iteraciones < MAX_ITERACIONES) {
    // Buscar la columna pivote: el valor más negativo de la fila Z
    let pivotCol = -1;
    let minVal = -EPS;
    for (let j = 0; j < totalCols - 1; j++) {
      if (zRow[j] < minVal) {
        minVal = zRow[j];
        pivotCol = j;
      }
    }

    // Si ya no hay negativos, llegamos al óptimo
    if (pivotCol === -1) break;

    // Buscar la fila pivote: menor cociente R / columna pivote (solo coeficientes > 0)
    let pivotRow = -1;
    let minRatio = Infinity;
    for (let i = 0; i < m; i++) {
      if (tableau[i][pivotCol] > EPS) {
        const ratio = tableau[i][totalCols - 1] / tableau[i][pivotCol];
        if (ratio < minRatio - EPS) {
          minRatio = ratio;
          pivotRow = i;
        }
      }
    }

    // Si ninguna fila califica, el problema no tiene solución acotada
    if (pivotRow === -1) {
      unbounded = true;
      break;
    }

    // 3. PIVOTEAR (Gauss-Jordan), igual que se hace a mano
    const pivotElement = tableau[pivotRow][pivotCol];

    // Fila pivote: se divide toda entre el elemento pivote
    tableau[pivotRow] = tableau[pivotRow].map(v => v / pivotElement);

    // El resto de las filas (incluida Z): fila - (coef. en columna pivote × nueva fila pivote)
    for (let i = 0; i < m; i++) {
      if (i === pivotRow) continue;
      const factor = tableau[i][pivotCol];
      tableau[i] = tableau[i].map((v, j) => v - factor * tableau[pivotRow][j]);
    }
    const factorZ = zRow[pivotCol];
    zRow = zRow.map((v, j) => v - factorZ * tableau[pivotRow][j]);

    basis[pivotRow] = pivotCol;
    iteraciones++;

    steps.push(snapshotTabla(tableau, zRow, basis, colNames, pivotRow, pivotCol));
  }

  // 4. LEER LA SOLUCIÓN FINAL
  const xValues = new Array(n).fill(0);
  const slackValues = new Array(m).fill(0);

  for (let i = 0; i < m; i++) {
    const varIndex = basis[i];
    const valor = round4(tableau[i][totalCols - 1]);
    if (varIndex < n) {
      xValues[varIndex] = valor;
    } else {
      slackValues[varIndex - n] = valor;
    }
  }

  const Z = round4(zRow[totalCols - 1]);

  return { steps, xValues, slackValues, Z, unbounded, colNames };
}

/** Redondea a 4 decimales, evitando arrastrar errores de punto flotante */
function round4(num) {
  return Math.round(num * 10000) / 10000;
}

/** Crea una "foto" de la tabla actual, ya lista para pintarse en la UI */
function snapshotTabla(tableau, zRow, basis, colNames, pivotRow, pivotCol) {
  return {
    filas: tableau.map((row, i) => ({
      base: colNames[basis[i]],
      valores: row.map(round4),
    })),
    zRow: zRow.map(round4),
    pivotRow,
    pivotCol,
  };
}

export { solveSimplex };