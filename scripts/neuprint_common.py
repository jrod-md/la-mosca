"""Shared neuPrint helpers for the MaleCNS extractors. No token ever enters output or logs."""

DATASET = 'male-cns:v1.0'
SERVER = 'https://neuprint.janelia.org'
ANNOTATIONS = ('type', 'instance', 'side', 'class', 'subclass', 'superclass', 'hemilineage', 'status', 'statusLabel')


def records(client, query):
    return client.fetch_custom(query).to_dict('records')


def edge_map(rows):
    """Directed pair -> raw ConnectsTo weight. Rejects duplicates and non-integer weights; never rounds."""
    result = {}
    for row in rows:
        key = (int(row['source']), int(row['target']))
        weight = row['weight']
        if key in result or weight is None or int(weight) != weight or weight <= 0:
            raise ValueError('Duplicate pair or invalid raw weight')
        result[key] = int(weight)
    return result
