# La Mosca

Le di B/. 100 a un cerebro de mosca para que apueste en el fútbol panameño.

El cerebro es real: 296 neuronas del cuerpo pedunculado (el centro de aprendizaje de la mosca) con sus conexiones y su morfología, tomadas del dataset **MaleCNS v1.0** de HHMI Janelia. Los partidos son reales: la Liga Panameña de Fútbol y la Selección. La plata no: la mosca arranca con B/. 100 ficticios.

Cada mañana la mosca revisa los partidos, cobra o pierde lo que apostó, aprende de eso y decide sus próximas jugadas. Cada apuesta queda en el historial público de este repo **antes** del partido, así que nadie puede cambiarla después.

**Demo:** https://metrofly.pages.dev

## Cómo decide

1. **El precio.** Un modelo Elo con goles Dixon-Coles, entrenado con 973 partidos de la LPF (2022 a 2026), cotiza cada partido como una casa de apuestas con 6 % de margen: 1X2, goles, ambos anotan y marcador exacto.
2. **El olor.** Cada opción (gana el local, empate, gana el visitante) llega al cerebro como un olor: un patrón sobre 48 glomérulos. El olor de cada equipo es fijo.
3. **El cerebro.** Ese patrón recorre las conexiones reales: neuronas de proyección, células de Kenyon (solo queda activo ~10 %) y neuronas de salida que empujan a acercarse o a evitar. La dirección de cada neurona de salida sale del conectoma.
4. **La decisión.** Elige con algo de azar, más cuanto más audaz está. A veces se atreve con la cuota más alta. Si nada le huele bien, no apuesta.
5. **El aprendizaje.** Al liquidar, la dopamina de premio o de castigo debilita las sinapsis activas de su compartimento, en proporción a la sorpresa. Así aprende una mosca de verdad.

Todo el azar sale de semillas derivadas del id del partido: cualquiera puede recalcular cada decisión.

## Real frente a modelado

| Real | Modelado por el proyecto |
| --- | --- |
| Identidad, tipo y neurotransmisor de cada neurona | Actividad neuronal y su dinámica |
| Conexiones y número de sinapsis | Codificación de cada opción como olor |
| Morfología (centerline skeletons) | Regla de aprendizaje y audacia |
| Partidos, fechas y resultados | Cuotas (Elo), saldo y apuestas |

Detalles científicos y de extracción en [`MALECNS.md`](./MALECNS.md).

## Vida diaria

`.github/workflows/daily.yml` corre todos los días a las 07:00 de Panamá:

```text
sync:matches   partidos y resultados (TheSportsDB)
fly:daily      liquida, aprende, apuesta y publica los próximos partidos cotizados
commit         data/ queda en el historial público
```

Los datos viven en `data/`:

| Archivo | Contenido |
| --- | --- |
| `matches.json` | Base de partidos normalizada; solo crece |
| `runs.json` | Bitácora de cada corrida, incluidas las fallidas |
| `history/` | Temporadas 2022 a 2024 de API-Football |
| `model/odds-model.json` | Parámetros y métricas del modelo de cuotas |
| `fly/state.json` | El cerebro: pesos sinápticos, saldo, audacia, rachas |
| `fly/bets.json` | Apuestas en vivo y partidos que decidió no apostar |
| `fly/upcoming.json` | Próximos partidos ya cotizados, para el sitio |
| `fly/infancy.json` | Su "infancia": 973 partidos vividos antes de debutar |

## Comandos

Requiere Node.js `>=22.12.0`.

```bash
npm ci
npm run dev
```

| Comando | Qué hace |
| --- | --- |
| `npm run sync:matches` | Sincroniza partidos (3 días atrás, 7 adelante). `-- --from AAAA-MM-DD --to AAAA-MM-DD` para backfill |
| `npm run fly:daily` | El día de la mosca: liquidar, aprender, apostar |
| `npm run fly:upcoming` | Solo recotiza los próximos partidos, sin apostar |
| `npm run calibrate:odds` | Reentrena el modelo de cuotas |
| `npm run fly:raise` | Vuelve a criar la mosca desde cero (se niega si ya tiene apuestas en vivo) |
| `npm run fetch:history` | Descarga temporadas de API-Football (requiere `API_FOOTBALL_KEY`) |

Validación (también en CI):

```bash
npm run typecheck
npm test
python -m unittest discover -s scripts -p "test_*.py"
npm run build
```

## Deployment

Sitio estático en Cloudflare Pages (`npm run build`, salida `dist/`). Cada commit diario de la mosca lo vuelve a publicar con los datos nuevos. Producción no requiere variables de entorno; `NEUPRINT_TOKEN` y `API_FOOTBALL_KEY` solo se usan localmente para regenerar datos.

## Aviso

Dinero ficticio. Esto no es una casa de apuestas, y no apuestes lo que diga una mosca.

Datos neuronales: MaleCNS v1.0, HHMI Janelia FlyEM, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Partidos: TheSportsDB y API-Football. El proyecto selecciona y transforma estos datos; no implica respaldo de sus autores.
