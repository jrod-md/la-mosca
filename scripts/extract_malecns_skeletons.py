"""Export official MaleCNS centerline skeletons for the verified mushroom body circuit.

The script runs only at development time. It reads NEUPRINT_TOKEN from its process
environment, never serializes it, and deliberately avoids logging raw HTTP errors.
"""
from __future__ import annotations

import argparse
import json
import math
import os
from pathlib import Path
import sys
from datetime import datetime, timezone

from neuprint_common import DATASET, SERVER
ROOT = Path(__file__).resolve().parents[1]
GRAPH_PATH = ROOT / 'src/data/generated/malecns_mushroom_body.json'
OUTPUT = ROOT / 'src/data/generated/malecns_mushroom_body_skeletons.json'


def finite_number(value):
    return isinstance(value, (int, float)) and math.isfinite(value)


def parse_swc_rows(rows):
    """Validate neuPrint's SWC-compatible rows without changing source topology."""
    points, ids = [], set()
    for row in rows:
        point_id, parent = int(row['rowId']), int(row['link'])
        if point_id <= 0 or point_id in ids or not all(finite_number(row[key]) for key in ('x', 'y', 'z')):
            raise ValueError('Invalid skeleton point')
        radius = row.get('radius')
        if radius is not None and not finite_number(radius):
            raise ValueError('Invalid skeleton radius')
        ids.add(point_id)
        points.append({'id': point_id, 'x': float(row['x']), 'y': float(row['y']), 'z': float(row['z']),
                       'parent': parent, **({'radius': float(radius)} if radius is not None else {})})
    if not points:
        raise ValueError('Empty skeleton')
    if any(point['parent'] != -1 and point['parent'] not in ids for point in points):
        raise ValueError('Skeleton parent is missing')
    return points


def point_distance(a, b):
    return math.sqrt(sum((a[key] - b[key]) ** 2 for key in ('x', 'y', 'z')))


def perpendicular_distance(point, start, end):
    """3D distance from a point to its line segment, used for a chain-only RDP pass."""
    vector = [end[key] - start[key] for key in ('x', 'y', 'z')]
    length_sq = sum(value * value for value in vector)
    if length_sq == 0:
        return point_distance(point, start)
    t = max(0, min(1, sum((point[key] - start[key]) * vector[index] for index, key in enumerate(('x', 'y', 'z'))) / length_sq))
    projection = {key: start[key] + t * vector[index] for index, key in enumerate(('x', 'y', 'z'))}
    return point_distance(point, projection)


def rdp_indices(chain, tolerance):
    if len(chain) <= 2:
        return list(range(len(chain)))
    most_distant, distance = -1, tolerance
    for index in range(1, len(chain) - 1):
        candidate = perpendicular_distance(chain[index], chain[0], chain[-1])
        if candidate > distance:
            most_distant, distance = index, candidate
    if most_distant < 0:
        return [0, len(chain) - 1]
    return rdp_indices(chain[:most_distant + 1], tolerance)[:-1] + [index + most_distant for index in rdp_indices(chain[most_distant:], tolerance)]


def simplify_skeleton(points, tolerance=250.0, max_segment_length=1800.0):
    """Keep roots/leaves/branches and simplify only unbranched chains.

    Parent IDs are rewired only across discarded points in the same source chain;
    no branches are joined, invented, or independently normalized.
    """
    by_id = {point['id']: point for point in points}
    children = {point_id: [] for point_id in by_id}
    roots = []
    for point in points:
        if point['parent'] == -1:
            roots.append(point['id'])
        else:
            children[point['parent']].append(point['id'])
    important = {point_id for point_id, descendants in children.items() if len(descendants) != 1}
    important.update(roots)
    kept = {point_id: {**by_id[point_id]} for point_id in important}

    for start_id in sorted(important):
        for child_id in children[start_id]:
            chain = [by_id[start_id], by_id[child_id]]
            cursor = child_id
            while cursor not in important:
                cursor = children[cursor][0]
                chain.append(by_id[cursor])
            selected_indices = set(rdp_indices(chain, tolerance))
            # Preserve shape even if RDP spans a very long, near-straight segment.
            for index in range(1, len(chain)):
                if point_distance(chain[index - 1], chain[index]) > max_segment_length:
                    selected_indices.add(index)
            selected = sorted(selected_indices)
            previous_id = start_id
            for index in selected[1:]:
                item = {**chain[index], 'parent': previous_id}
                kept[item['id']] = item
                previous_id = item['id']

    simplified = [kept[point_id] for point_id in sorted(kept)]
    simplified_ids = {point['id'] for point in simplified}
    if any(point['parent'] != -1 and point['parent'] not in simplified_ids for point in simplified):
        raise ValueError('Simplification lost a parent')
    return simplified


def global_normalization(neurons):
    coordinates = [point for neuron in neurons for point in neuron['points']]
    if not coordinates:
        raise ValueError('No skeleton coordinates')
    minimum = [min(point[key] for point in coordinates) for key in ('x', 'y', 'z')]
    maximum = [max(point[key] for point in coordinates) for key in ('x', 'y', 'z')]
    extent = [maximum[index] - minimum[index] for index in range(3)]
    scale = max(extent) / 2
    if not finite_number(scale) or scale <= 0:
        raise ValueError('Invalid combined spatial extent')
    return {'sourceBounds': {'min': minimum, 'max': maximum},
            'center': [(minimum[index] + maximum[index]) / 2 for index in range(3)],
            'scale': scale,
            'formula': 'normalized = (source_coordinate - global_center) / global_scale; one transform applies to every neuron'}


def load_graph():
    graph = json.loads(GRAPH_PATH.read_text(encoding='utf-8'))
    metadata = graph.get('metadata', {})
    if metadata.get('dataset') != DATASET or not metadata.get('realConnectivity') or not graph.get('nodes'):
        raise ValueError('Verified MaleCNS graph is unavailable')
    ids = [node.get('bodyId') for node in graph['nodes']]
    if len(ids) != len(set(ids)) or any(not isinstance(body_id, int) or body_id <= 0 for body_id in ids):
        raise ValueError('Graph body IDs are invalid')
    return graph


def fetch_all(client, graph, tolerance, max_segment_length):
    neurons, failures, source_points = [], [], 0
    for node in sorted(graph['nodes'], key=lambda item: item['bodyId']):
        body_id = node['bodyId']
        try:
            frame = client.fetch_skeleton(body_id, heal=False, format='pandas')
            points = parse_swc_rows(frame.to_dict('records'))
            simplified = simplify_skeleton(points, tolerance=tolerance, max_segment_length=max_segment_length)
            source_points += len(points)
            neurons.append({'bodyId': body_id, 'type': node.get('type'), 'instance': node.get('instance'),
                            'role': node.get('role', node.get('category')), 'activityKey': node['id'],
                            'originalPointCount': len(points), 'simplifiedPointCount': len(simplified), 'points': simplified})
        except Exception as error:
            # Continue with available official morphology. Never expose HTTP details.
            failures.append({'bodyId': body_id, 'reason': type(error).__name__})
    return neurons, failures, source_points


def build_export(graph, neurons, failures, source_points, tolerance, max_segment_length):
    normalization = global_normalization(neurons)
    simplified_points = sum(neuron['simplifiedPointCount'] for neuron in neurons)
    return {'metadata': {
        'dataset': DATASET, 'source': 'HHMI Janelia FlyEM', 'license': 'CC-BY-4.0',
        'sourceUrl': 'https://male-cns.janelia.org/download/',
        'generatedAt': datetime.now(timezone.utc).isoformat(),
        'requestedNeuronCount': len(graph['nodes']), 'availableNeuronCount': len(neurons),
        'missingBodyIds': [failure['bodyId'] for failure in failures],
        'originalPointCount': source_points, 'simplifiedPointCount': simplified_points,
        'compressionRatio': simplified_points / source_points if source_points else 0,
        'normalization': normalization,
        'simplification': {'algorithm': 'roots, leaves and branch points retained; 3D Ramer-Douglas-Peucker on linear chains; long source segments retained',
                           'rdpTolerance': tolerance, 'maxSourceSegmentLength': max_segment_length},
        'retrieval': {'method': 'neuprint-python Client.fetch_skeleton(bodyId, heal=False, format=pandas)',
                      'connectivityArtifact': str(GRAPH_PATH.relative_to(ROOT)).replace('\\', '/')},
        'limitations': 'Centerlines are real official morphology. Roles and activity are project visualization choices. Missing skeletons are omitted, never fabricated.'
    }, 'neurons': neurons, 'failures': failures}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--overwrite', action='store_true', help='Explicitly replace the generated skeleton asset')
    parser.add_argument('--rdp-tolerance', type=float, default=250.0)
    parser.add_argument('--max-segment-length', type=float, default=1800.0)
    args = parser.parse_args()
    if args.rdp_tolerance <= 0 or args.max_segment_length <= 0:
        parser.error('Simplification distances must be positive')
    if OUTPUT.exists() and not args.overwrite:
        parser.error('Skeleton output exists; pass --overwrite after review')
    if not os.environ.get('NEUPRINT_TOKEN', '').strip():
        print('NEUPRINT_TOKEN is missing. No skeleton asset was written.', file=sys.stderr)
        return 2
    try:
        from neuprint import Client
        graph = load_graph()
        client = Client(SERVER, dataset=DATASET, token=os.environ['NEUPRINT_TOKEN'])
        if DATASET not in client.fetch_datasets():
            raise ValueError('Dataset is unavailable')
        neurons, failures, source_points = fetch_all(client, graph, args.rdp_tolerance, args.max_segment_length)
        if not neurons:
            raise ValueError('No skeletons were retrieved')
        artifact = build_export(graph, neurons, failures, source_points, args.rdp_tolerance, args.max_segment_length)
        staged = OUTPUT.with_suffix('.json.tmp')
        staged.write_text(json.dumps(artifact, ensure_ascii=False, allow_nan=False, separators=(',', ':')) + '\n', encoding='utf-8')
        staged.replace(OUTPUT)
        meta = artifact['metadata']
        print(f"Official skeleton export: {meta['availableNeuronCount']}/{meta['requestedNeuronCount']} neurons; {meta['originalPointCount']} source points; {meta['simplifiedPointCount']} rendered points.")
        return 0
    except Exception as error:
        print(f'Extraction failed ({type(error).__name__}). No skeleton asset was written.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
