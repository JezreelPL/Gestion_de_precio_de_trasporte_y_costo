/**
 * MÓDULO: Método de Vogel (VAM) para el Problema de Transporte
 * -----------------------------------------------------------
 * Resuelve: dado un arreglo de ofertas (bodegas), un arreglo de
 * demandas (destinos) y una matriz de costos, encuentra una
 * asignación inicial de bajo costo (no siempre el óptimo absoluto,
 * pero muy cercano — de ahí que en clase lo usen como punto de partida).
 *
 * Entradas esperadas:
 *   supply = [100, 80, 70]              // oferta de cada bodega
 *   demand = [90, 100, 60]              // demanda de cada destino
 *   costs  = [[4,6,8], [5,3,9], [7,8,2]] // costo[origen][destino]
 *
 * Salida:
 *   {
 *     steps: [...]        // registro de cada iteración (para mostrar en UI)
 *     allocation: [[...]] // matriz final con las unidades asignadas
 *     totalCost: number   // costo total de la solución
 *     balanced: bool      // si hubo que balancear oferta/demanda
 *   }
 */

function solveVogel(supplyInput, demandInput, costsInput) {
  // Copiamos los arreglos para no modificar los originales del usuario
  let supply = [...supplyInput];
  let demand = [...demandInput];
  let costs = costsInput.map(row => [...row]);

  const totalSupply = supply.reduce((a, b) => a + b, 0);
  const totalDemand = demand.reduce((a, b) => a + b, 0);
  let balanced = false;

  // 1. BALANCEO: si oferta y demanda no coinciden, se agrega
  //    una bodega o destino ficticio con costo 0 (regla clásica de Vogel)
  if (totalSupply > totalDemand) {
    demand.push(totalSupply - totalDemand);
    costs.forEach(row => row.push(0));
    balanced = true;
  } else if (totalDemand > totalSupply) {
    supply.push(totalDemand - totalSupply);
    costs.push(new Array(demand.length).fill(0));
    balanced = true;
  }

  const numOrigins = supply.length;
  const numDestinations = demand.length;

  // Matriz de asignación final (empieza vacía, se llena en cada iteración)
  const allocation = Array.from({ length: numOrigins }, () =>
    new Array(numDestinations).fill(0)
  );

  // Marca qué filas/columnas ya quedaron completamente satisfechas
  const rowDone = new Array(numOrigins).fill(false);
  const colDone = new Array(numDestinations).fill(false);

  const steps = []; // aquí guardamos el detalle de cada iteración para la UI

  let remainingSupply = [...supply];
  let remainingDemand = [...demand];

  // Mientras queden filas y columnas activas
  while (rowDone.includes(false) && colDone.includes(false)) {
    // 2. CALCULAR PENALIZACIONES de cada fila activa
    const rowPenalties = [];
    for (let i = 0; i < numOrigins; i++) {
      if (rowDone[i]) {
        rowPenalties.push(-1); // -1 indica "no aplica"
        continue;
      }
      const activeCosts = [];
      for (let j = 0; j < numDestinations; j++) {
        if (!colDone[j]) activeCosts.push(costs[i][j]);
      }
      rowPenalties.push(getPenalty(activeCosts));
    }

    // 3. CALCULAR PENALIZACIONES de cada columna activa
    const colPenalties = [];
    for (let j = 0; j < numDestinations; j++) {
      if (colDone[j]) {
        colPenalties.push(-1);
        continue;
      }
      const activeCosts = [];
      for (let i = 0; i < numOrigins; i++) {
        if (!rowDone[i]) activeCosts.push(costs[i][j]);
      }
      colPenalties.push(getPenalty(activeCosts));
    }

    // 4. ELEGIR LA MAYOR PENALIZACIÓN (fila o columna)
    const maxRowPenalty = Math.max(...rowPenalties);
    const maxColPenalty = Math.max(...colPenalties);

    let selectedRow = -1;
    let selectedCol = -1;

    if (maxRowPenalty >= maxColPenalty) {
      // La mayor penalización está en una fila
      selectedRow = rowPenalties.indexOf(maxRowPenalty);
      selectedCol = getMinCostCol(costs, selectedRow, colDone);
    } else {
      // La mayor penalización está en una columna
      selectedCol = colPenalties.indexOf(maxColPenalty);
      selectedRow = getMinCostRow(costs, selectedCol, rowDone);
    }

    // 5. ASIGNAR el mínimo entre lo que queda de oferta y de demanda
    const qty = Math.min(remainingSupply[selectedRow], remainingDemand[selectedCol]);
    allocation[selectedRow][selectedCol] = qty;

    remainingSupply[selectedRow] -= qty;
    remainingDemand[selectedCol] -= qty;

    // Guardamos este paso para poder mostrarlo en la interfaz
    steps.push({
      row: selectedRow,
      col: selectedCol,
      quantity: qty,
      cost: costs[selectedRow][selectedCol],
      rowPenalties: [...rowPenalties],
      colPenalties: [...colPenalties],
    });

    // 6. Si la fila o columna se quedó en 0, se marca como terminada
    if (remainingSupply[selectedRow] === 0) rowDone[selectedRow] = true;
    if (remainingDemand[selectedCol] === 0) colDone[selectedCol] = true;
  }

  // 7. CALCULAR EL COSTO TOTAL de la solución encontrada
  let totalCost = 0;
  for (let i = 0; i < numOrigins; i++) {
    for (let j = 0; j < numDestinations; j++) {
      totalCost += allocation[i][j] * costs[i][j];
    }
  }

  return { steps, allocation, totalCost, balanced, costs, supply, demand };
}

/**
 * Calcula la penalización de una fila o columna:
 * diferencia entre el costo más bajo y el segundo más bajo.
 * Si solo queda una celda activa, la penalización es 0 (no hay de otra).
 */
function getPenalty(activeCosts) {
  if (activeCosts.length === 0) return -1;
  if (activeCosts.length === 1) return 0;
  const sorted = [...activeCosts].sort((a, b) => a - b);
  return sorted[1] - sorted[0];
}

/** Encuentra la columna de menor costo dentro de una fila (ignorando columnas cerradas) */
function getMinCostCol(costs, row, colDone) {
  let minCost = Infinity;
  let minCol = -1;
  for (let j = 0; j < costs[row].length; j++) {
    if (!colDone[j] && costs[row][j] < minCost) {
      minCost = costs[row][j];
      minCol = j;
    }
  }
  return minCol;
}

/** Encuentra la fila de menor costo dentro de una columna (ignorando filas cerradas) */
function getMinCostRow(costs, col, rowDone) {
  let minCost = Infinity;
  let minRow = -1;
  for (let i = 0; i < costs.length; i++) {
    if (!rowDone[i] && costs[i][col] < minCost) {
      minCost = costs[i][col];
      minRow = i;
    }
  }
  return minRow;
}

// Para poder usar esta función desde otros archivos (transporte.html)
export { solveVogel };