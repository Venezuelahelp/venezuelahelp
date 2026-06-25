# Task 12 — Coordinate-order fix report

## Fixture values used

### sismovenezuela — `sismo_building_damage.json` feature[0]

- `properties.id`: `c3ad9576-f4c8-41f4-98df-b3345a80fe6b`
- `geometry.coordinates`: `[-66.925, 10.601]` (coords[0]=lng, coords[1]=lat)
- Expected mapping: `ubicacion.lat = 10.601`, `ubicacion.lng = -66.925`
- Swap guard: `10.601 !== -66.925` ✓ (non-vacuous)

### terremotovenezuela — `tv_missing_map.json` markers[0]

- `id`: `e55b1b4b-13bc-4344-8715-1b888e8a539b`
- `lat`: `9.9097`, `lng`: `-67.3577`
- Expected mapping: `ubicacion.lat = 9.9097`, `ubicacion.lng = -67.3577`
- Swap guard: `9.9097 !== -67.3577` ✓ (non-vacuous)

## Commands run

```
npm test --workspace @venezuelahelp/backend -- sismovenezuela terremotovenezuela
npm test --workspace @venezuelahelp/backend
```

## Results

### Focused run (2 files, 5 tests)

```
✓ src/connectors/__tests__/terremotovenezuela.test.ts  (2 tests) 3ms
✓ src/connectors/__tests__/sismovenezuela.test.ts  (3 tests) 4ms
Test Files  2 passed (2) | Tests  5 passed (5)
```

### Full backend suite (14 files, 31 tests)

```
Test Files  14 passed (14) | Tests  31 passed (31)
```

All tests green. Swap guards are non-vacuous (lat ≠ lng in both fixtures).
