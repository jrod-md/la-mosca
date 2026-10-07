# MaleCNS: el cerebro de la mosca

## Qué se usa

`src/data/generated/malecns_mushroom_body.json`: un circuito del cuerpo pedunculado del hemisferio derecho de **MaleCNS v1.0** (`male-cns:v1.0`), con **296 neuronas y 4.181 conexiones dirigidas** verificadas contra el servidor.

| Rol | Tipos | Neuronas |
| --- | --- | --- |
| PN, entrada | 48 tipos uniglomerulares adPN/lPN (uno por glomérulo) | 48 |
| KC, codificación | KCab-c, KCab-m, KCab-s, KCa'b'-ap2, KCa'b'-m, KCg-m | 160 |
| MBON, salida | MBON01 a MBON35 (sin variantes "-like") | 40 |
| DAN de recompensa | PAM01 a PAM15 | 40 |
| DAN de castigo | PPL101 a PPL108 | 8 |

Los neurotransmisores predichos coinciden con la biología conocida (PN y KC colinérgicas, DAN dopaminérgicas, MBON mixtas), lo cual sirve como control de la selección. Las elecciones de tipos y sus razones están en `scripts/extract-mushroom-body.ps1`.

`src/data/generated/malecns_mushroom_body_skeletons.json` (cuando existe): morfología centerline oficial de esas neuronas, para el panel del cerebro. Sin ese archivo el sitio muestra posiciones esquemáticas y lo dice.

Fuentes: [MaleCNS](https://male-cns.janelia.org/download/), [neuprint-python](https://connectome-neuprint.github.io/neuprint-python/docs/client.html) (`neuprint-python==0.6.3`). Licencia [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Atribución: MaleCNS v1.0, HHMI Janelia FlyEM Project. El proyecto selecciona y transforma una parte del grafo y añade actividad simulada; no implica respaldo de Janelia.

## Regenerar (solo en desarrollo)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r scripts/requirements-malecns.txt
.\scripts\extract-mushroom-body.ps1 --overwrite   # circuito
.\scripts\extract-skeletons.ps1 --overwrite       # morfología
```

Ambos scripts piden el token de neuPrint con entrada oculta, lo mantienen solo en el proceso y lo borran al terminar. Nunca va en el código, en `.env` versionado ni en variables `VITE_*`; el frontend no consulta neuPrint. Para explorar tipos: `scripts/extract_mushroom_body.py --inspect`.

## Metodología del extractor

1. Resolver cada rol por tipos exactos (y `somaSide` = R). Una etiqueta inexistente aborta.
2. PN, MBON y DAN: alternar entre tipos por body ID hasta el límite de cada rol. KC: alternar entre tipos, cada uno ordenado por entrada total desde las PN elegidas.
3. Recuperar todas las conexiones `ConnectsTo` inducidas con peso ≥ 3, sin redondear ni sumar ROIs. Si exceden el límite, falla en vez de recortar.
4. Exigir todas las etapas del aprendizaje (PN→KC, KC→MBON, DAN de recompensa y de castigo hacia KC o MBON). Un circuito parcial no se exporta.
5. Volver a consultar identidades, anotaciones, pares y pesos; cualquier diferencia aborta.
6. Exportar metadata, consultas exactas, límites y SHA-256 del contenido (identifica el contenido; no es una firma de Janelia). Escritura atómica.

## Del conectoma al comportamiento (`src/brain/`)

| Paso | Real | Decisión del proyecto |
| --- | --- | --- |
| Olor de cada opción | — | Conjuntos deterministas de glomérulos por equipo, rol y rango de cuota |
| PN → KC | Pesos sinápticos reales, normalizados por la entrada total de cada KC | Solo ~10 % de KC activas (inhibición global tipo APL, que no está en el grafo) |
| KC → MBON | Pesos reales como valor inicial de cada sinapsis plástica | — |
| Acercarse o evitar | Qué clase de DAN inerva cada MBON (sinapsis DAN→MBON) | Valencia = (PPL1 − PAM) / total, según Aso et al. 2014 |
| Aprendizaje | Acoplamiento DAN→MBON real por compartimento | Depresión de sinapsis activas proporcional a la sorpresa; recuperación lenta |
| Audacia, tilt, atrevimiento | — | Estado de excitación inspirado en la octopamina; no sale del conectoma |

Todas las conexiones se tratan como positivas en la propagación; no se modelan potenciales, tiempos biológicos ni inhibición explícita. Nada de esto demuestra fidelidad electrofisiológica: es un modelo de visualización y conducta construido sobre conectividad real.
