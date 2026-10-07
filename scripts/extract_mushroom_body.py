"""Bounded, verified mushroom body circuit from MaleCNS. No token ever enters output or exception logs.

Roles (PN, KC, MBON, reward DAN, punishment DAN) come only from exact type labels passed on
the command line after --inspect. The reward/punishment split is a project decision based on
the literature (PAM ~ reward, PPL1 ~ punishment), not a dataset annotation.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import sys
from datetime import datetime, timezone

from extract_malecns import ANNOTATIONS, DATASET, SERVER, edge_map, records

OUTPUT = Path(__file__).resolve().parents[1] / 'src/data/generated/malecns_mushroom_body.json'
class CircuitError(ValueError):
    """Raised for our own validation failures; safe to print (never contains request data)."""


SIDE_KEYS = ('side', 'somaSide', 'rootSide')
# Hemisphere and predicted transmitter (sign of each output) are kept when the dataset has them.
EXTRA_ANNOTATIONS = ('somaSide', 'rootSide', 'consensusNt', 'predictedNt', 'predictedNtConfidence')
ROLES = ('pn', 'kc', 'mbon', 'dan_reward', 'dan_punishment')
ROLE_LIMITS = {'pn': 80, 'kc': 240, 'mbon': 40, 'dan_reward': 40, 'dan_punishment': 24}
MAX_NODES = 400
MAX_EDGES = 12000


def round_robin(rows, limit):
    """Alternate across exact types, keeping each type's incoming order."""
    groups = {}
    for row in rows:
        groups.setdefault(row['type'], []).append(int(row['bodyId']))
    ordered = []
    while any(groups.values()) and len(ordered) < limit:
        for group in groups.values():
            if group and len(ordered) < limit:
                ordered.append(group.pop(0))
    return ordered


def side_key(keys):
    """MaleCNS stores the hemisphere as somaSide; other datasets use side."""
    return next((key for key in SIDE_KEYS if key in keys), None)


def side_filter(side, keys, alias='n'):
    if not side:
        return ''
    key = side_key(keys)
    if not key:
        raise CircuitError('No side property; inspect schema or omit --side')
    return f' AND {alias}.`{key}` = {json.dumps(side)}'


def resolve(client, types, side, keys):
    if 'type' not in keys:
        raise CircuitError('No type property; inspect schema before selecting roles')
    rows = records(client, f'MATCH (n:Neuron) WHERE n.type IN {json.dumps(types)}{side_filter(side, keys)} '
                           'RETURN n.bodyId AS bodyId, n.type AS type ORDER BY type, bodyId')
    missing = sorted(set(types) - {row['type'] for row in rows})
    if missing:
        raise CircuitError(f'Exact role labels not found{" on side " + side if side else ""}: {", ".join(missing)}')
    return rows


def rank_kcs(client, pns, kc_types, side, keys, min_weight):
    """KCs with the strongest total input from the selected PNs. ConnectsTo weights are already per pair."""
    query = (f'MATCH (p:Neuron)-[r:ConnectsTo]->(n:Neuron) WHERE p.bodyId IN {json.dumps(pns)} '
             f'AND n.type IN {json.dumps(kc_types)}{side_filter(side, keys)} AND r.weight >= {min_weight} '
             'RETURN n.bodyId AS bodyId, n.type AS type, sum(r.weight) AS input ORDER BY input DESC, bodyId')
    return query, records(client, query)


def validate_circuit(graph):
    ids = {node['bodyId'] for node in graph['nodes']}
    if len(ids) != len(graph['nodes']) or not 5 <= len(ids) <= MAX_NODES:
        raise CircuitError('Invalid node count')
    if not 1 <= len(graph['edges']) <= MAX_EDGES:
        raise CircuitError('Invalid edge count')
    if any(not isinstance(body, int) or not 0 < body <= 2**53 - 1 for body in ids):
        raise CircuitError('Body ID cannot be represented safely by JavaScript')
    if any(node['role'] not in ROLES for node in graph['nodes']):
        raise CircuitError('Unknown role')
    pairs = set()
    for edge in graph['edges']:
        pair = (int(edge['source']), int(edge['target']))
        if pair in pairs or not set(pair).issubset(ids) or not isinstance(edge['weight'], int) or edge['weight'] <= 0:
            raise CircuitError('Invalid edge')
        pairs.add(pair)


def extract(client, args, keys):
    side = args.side
    pn_rows = resolve(client, args.pn_type, side, keys)
    dan_reward_rows = resolve(client, args.dan_reward_type, side, keys)
    dan_punishment_rows = resolve(client, args.dan_punishment_type, side, keys)
    mbon_rows = resolve(client, args.mbon_type, side, keys)
    pns = round_robin(pn_rows, args.max_pn)
    kc_query, kc_rows = rank_kcs(client, pns, args.kc_type, side, keys, args.min_weight)
    if not set(args.kc_type).issubset({row['type'] for row in kc_rows}):
        raise CircuitError('A KC type receives no input from the selected PNs at this threshold')
    selection = {
        'pn': pns,
        'kc': round_robin(kc_rows, args.max_kc),
        'mbon': round_robin(mbon_rows, args.max_mbon),
        'dan_reward': round_robin(dan_reward_rows, args.max_dan_reward),
        'dan_punishment': round_robin(dan_punishment_rows, args.max_dan_punishment),
    }
    roles = {}
    for role, bodies in selection.items():
        for body in bodies:
            if body in roles:
                raise CircuitError('A neuron matched two roles; role labels must be disjoint')
            roles[body] = role
    ids = sorted(roles)
    if len(ids) > MAX_NODES:
        raise CircuitError('Selection exceeds the node cap; lower the per-role limits')

    available = [key for key in ANNOTATIONS + EXTRA_ANNOTATIONS if key in keys]
    projection = ', '.join(f'{key}: n.`{key}`' for key in available)
    node_query = f'MATCH (n:Neuron) WHERE n.bodyId IN {json.dumps(ids)} RETURN n.bodyId AS bodyId, {{{projection}}} AS annotations ORDER BY bodyId'
    edge_query = (f'MATCH (a:Neuron)-[r:ConnectsTo]->(b:Neuron) WHERE a.bodyId IN {json.dumps(ids)} '
                  f'AND b.bodyId IN {json.dumps(ids)} AND r.weight >= {args.min_weight} '
                  'RETURN a.bodyId AS source, b.bodyId AS target, r.weight AS weight ORDER BY source, target')
    node_rows = records(client, node_query)
    edges = edge_map(records(client, edge_query))
    if {int(row['bodyId']) for row in node_rows} != set(ids):
        raise CircuitError('A selected neuron could not be verified')
    if len(edges) > MAX_EDGES:
        raise CircuitError('Induced circuit exceeds the edge cap; lower the per-role limits instead of dropping edges')

    # The learning model needs every stage of the circuit; refuse a partial one.
    def has(sources, targets):
        return any(roles[a] in sources and roles[b] in targets for a, b in edges)
    required = {'PN->KC': has(('pn',), ('kc',)), 'KC->MBON': has(('kc',), ('mbon',)),
                'rewardDAN->KC|MBON': has(('dan_reward',), ('kc', 'mbon')),
                'punishmentDAN->KC|MBON': has(('dan_punishment',), ('kc', 'mbon'))}
    missing = [name for name, present in required.items() if not present]
    if missing:
        raise CircuitError(f'Circuit incomplete at this threshold: {", ".join(missing)}')

    verified_nodes = records(client, node_query)
    verified_edges = edge_map(records(client, edge_query))
    if node_rows != verified_nodes or verified_edges != edges:
        raise CircuitError('Verification disagrees with extraction; refusing export')

    nodes = []
    for row in node_rows:
        body = int(row['bodyId'])
        annotations = row['annotations']
        node = {'type': annotations.get('type'), 'instance': annotations.get('instance'),
                'side': next((annotations.get(key) for key in SIDE_KEYS if annotations.get(key) is not None), None)}
        if any(value is not None and not isinstance(value, str) for value in node.values()):
            raise CircuitError('Unexpected annotation type; inspect schema before adapting')
        node.update(id=str(body), bodyId=body, annotations=annotations, role=roles[body], roleBasis='cli-exact-type')
        nodes.append(node)
    edge_list = [dict(source=str(a), target=str(b), weight=weight) for (a, b), weight in sorted(edges.items())]
    counts = {role: len(bodies) for role, bodies in selection.items()}
    graph = {'metadata': {
        'dataset': DATASET, 'source': 'HHMI Janelia FlyEM', 'license': 'CC-BY-4.0',
        'sourceUrl': 'https://male-cns.janelia.org/download/',
        'extractedAt': datetime.now(timezone.utc).isoformat(), 'realConnectivity': True,
        'description': 'Bounded mushroom body circuit: projection neurons, Kenyon cells, output neurons and dopaminergic neurons. Roles assigned by exact type labels chosen by the project.',
        'nodeCount': len(nodes), 'edgeCount': len(edge_list), 'roleCounts': counts,
        'verification': {'bodyIds': True, 'edges': True, 'weights': True},
        'methodology': {'schemaKeys': sorted(keys), 'annotationFields': available, 'side': side, 'sideKey': side_key(keys),
            'roleTypes': {'pn': args.pn_type, 'kc': args.kc_type, 'mbon': args.mbon_type,
                          'dan_reward': args.dan_reward_type, 'dan_punishment': args.dan_punishment_type},
            'roleLimits': {'pn': args.max_pn, 'kc': args.max_kc, 'mbon': args.max_mbon,
                           'dan_reward': args.max_dan_reward, 'dan_punishment': args.max_dan_punishment},
            'minWeight': args.min_weight, 'kcRankingQuery': kc_query, 'kcCandidateCount': len(kc_rows),
            'nodeQuery': node_query, 'edgeQuery': edge_query,
            'selection': 'PN, MBON and DAN: round-robin across exact types by body ID. KC: round-robin across exact types, each ordered by total input from the selected PNs. All induced edges at the threshold are kept; none are dropped.',
            'roleBasis': 'Reward/punishment DAN split follows the literature (PAM ~ reward, PPL1 ~ punishment); it is a project decision, not a dataset annotation.',
            'verification': 'Fresh queries for every retained identity, annotation, directed pair and exact raw weight.',
            'contentSha256': hashlib.sha256(json.dumps({'nodes': nodes, 'edges': edge_list}, sort_keys=True).encode()).hexdigest()}
    }, 'nodes': nodes, 'edges': edge_list}
    validate_circuit(graph)
    return graph


INSPECT_PATTERN = "(?i)^(KC|MBON|PAM|PPL1).*|.*PN.*"


def inspect(client, keys):
    key = side_key(keys)
    side = f', n.`{key}` AS side' if key else ''
    order = ', side' if side else ''
    types = records(client, f"MATCH (n:Neuron) WHERE n.type =~ '{INSPECT_PATTERN}' "
                            f'RETURN n.type AS type{side}, count(n) AS count ORDER BY type{order} LIMIT 800') if 'type' in keys else []
    classes = {}
    for key in ('class', 'superclass'):
        if key in keys:
            classes[key] = records(client, f'MATCH (n:Neuron) WHERE n.`{key}` IS NOT NULL RETURN n.`{key}` AS value, count(n) AS count ORDER BY value LIMIT 300')
    return {'dataset': DATASET, 'schemaKeys': keys, 'candidateTypes': types, 'classValues': classes,
            'note': 'Search hints only. Review labels in neuPrint, then pass exact types per role.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--inspect', action='store_true', help='Read live schema and candidate MB types, without exporting')
    parser.add_argument('--side', help='Exact side value (see --inspect); omit to use both sides')
    parser.add_argument('--pn-type', action='append', default=[])
    parser.add_argument('--kc-type', action='append', default=[])
    parser.add_argument('--mbon-type', action='append', default=[])
    parser.add_argument('--dan-reward-type', action='append', default=[])
    parser.add_argument('--dan-punishment-type', action='append', default=[])
    parser.add_argument('--max-pn', type=int, default=40)
    parser.add_argument('--max-kc', type=int, default=160)
    parser.add_argument('--max-mbon', type=int, default=24)
    parser.add_argument('--max-dan-reward', type=int, default=24)
    parser.add_argument('--max-dan-punishment', type=int, default=12)
    parser.add_argument('--min-weight', type=int, default=3)
    parser.add_argument('--overwrite', action='store_true', help='Explicitly allow replacing a previously verified extract')
    args = parser.parse_args()
    token = os.environ.get('NEUPRINT_TOKEN', '').strip()
    if not token:
        print('NEUPRINT_TOKEN is missing. Nothing exported.', file=sys.stderr)
        return 2
    limits = [(getattr(args, f'max_{role}'), ROLE_LIMITS[role]) for role in ROLES]
    if any(not 1 <= value <= high for value, high in limits) or not 1 <= args.min_weight <= 10000:
        parser.error(f'Limits exceeded: per-role caps {ROLE_LIMITS}, min weight 1..10000')
    if not args.inspect and not all(getattr(args, f'{role}_type') for role in ROLES):
        parser.error('Run --inspect first, then pass at least one exact type for every role')
    if not args.inspect and OUTPUT.exists() and not args.overwrite:
        parser.error('Output already exists; review it before using --overwrite')
    try:
        from neuprint import Client
    except ImportError:
        print('Install scripts/requirements-malecns.txt in a local Python environment.', file=sys.stderr)
        return 2
    try:
        client = Client(SERVER, dataset=DATASET, token=token)
        if DATASET not in client.fetch_datasets():
            raise CircuitError('Dataset not accessible')
        keys = client.fetch_neuron_keys()
        if args.inspect:
            print(json.dumps(inspect(client, keys), indent=2, default=str))
            return 0
        graph = extract(client, args, keys)
        serialized = json.dumps(graph, indent=1, ensure_ascii=False, allow_nan=False)
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        staging = OUTPUT.with_suffix('.json.tmp')
        staging.write_text(serialized + '\n', encoding='utf-8')
        staging.replace(OUTPUT)
        counts = ', '.join(f'{role} {count}' for role, count in graph['metadata']['roleCounts'].items())
        print(f"Verified export: {len(graph['nodes'])} neurons ({counts}), {len(graph['edges'])} directed connections. {OUTPUT}")
        return 0
    except Exception as error:
        # HTTP exceptions can contain request headers. Never print raw errors or tracebacks.
        print(f'Extraction failed ({type(error).__name__}: {error if isinstance(error, CircuitError) else "redacted"}). No replacement exported.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
