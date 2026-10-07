"""Offline tests use synthetic IDs and labels. They are NOT evidence of Janelia connectivity."""
import json
import re
import unittest
from types import SimpleNamespace
from extract_mushroom_body import CircuitError, extract, round_robin, validate_circuit

KEYS = ['bodyId', 'type', 'side']
TYPES = {1: 'fixPN', 2: 'fixPN', 10: 'fixKCa', 11: 'fixKCa', 12: 'fixKCg', 20: 'fixMBON', 30: 'fixPAM', 31: 'fixPPL'}
EDGES = {(1, 10): 5, (2, 11): 4, (1, 12): 6, (10, 20): 8, (11, 20): 3, (12, 20): 9, (30, 10): 4, (30, 20): 5, (31, 20): 3, (31, 12): 4}


class Frame:
    def __init__(self, rows): self.rows = rows
    def to_dict(self, _): return self.rows


def ids_in(query, alias):
    return set(json.loads(re.search(rf'{alias}\.bodyId IN (\[[^\]]*\])', query).group(1)))


class FakeClient:
    def __init__(self, edges=EDGES, corrupt=False):
        self.edges, self.corrupt, self.edge_reads = dict(edges), corrupt, 0

    def fetch_custom(self, query):
        min_weight = int(re.search(r'r\.weight >= (\d+)', query).group(1)) if 'r.weight >=' in query else 0
        if 'sum(r.weight) AS input' in query:
            pns, totals = ids_in(query, 'p'), {}
            for (a, b), weight in self.edges.items():
                if a in pns and f'"{TYPES[b]}"' in query and weight >= min_weight:
                    totals[b] = totals.get(b, 0) + weight
            return Frame([{'bodyId': b, 'type': TYPES[b], 'input': total} for b, total in sorted(totals.items(), key=lambda item: (-item[1], item[0]))])
        if 'AS annotations' in query:
            return Frame([{'bodyId': body, 'annotations': {'type': TYPES[body], 'side': 'R'}} for body in sorted(ids_in(query, 'n'))])
        if 'r.weight AS weight' in query:
            self.edge_reads += 1
            ids = ids_in(query, 'a')
            rows = [{'source': a, 'target': b, 'weight': w} for (a, b), w in sorted(self.edges.items()) if {a, b} <= ids and w >= min_weight]
            if self.corrupt and self.edge_reads > 1:
                rows[0] = dict(rows[0], weight=rows[0]['weight'] + 1)
            return Frame(rows)
        return Frame([{'bodyId': body, 'type': kind} for body, kind in sorted(TYPES.items()) if f'"{kind}"' in query])


def make_args(**overrides):
    args = dict(side='R', pn_type=['fixPN'], kc_type=['fixKCa', 'fixKCg'], mbon_type=['fixMBON'],
                dan_reward_type=['fixPAM'], dan_punishment_type=['fixPPL'], max_pn=40, max_kc=160,
                max_mbon=24, max_dan_reward=24, max_dan_punishment=12, min_weight=3)
    args.update(overrides)
    return SimpleNamespace(**args)


class MushroomBodyTests(unittest.TestCase):
    def test_round_robin_alternates_types_and_respects_limit(self):
        rows = [{'bodyId': 1, 'type': 'a'}, {'bodyId': 2, 'type': 'a'}, {'bodyId': 3, 'type': 'b'}]
        self.assertEqual(round_robin(rows, 2), [1, 3])
        self.assertEqual(round_robin(rows, 10), [1, 3, 2])

    def test_extraction_assigns_roles_and_keeps_raw_weights(self):
        graph = extract(FakeClient(), make_args(), KEYS)
        validate_circuit(graph)
        roles = {node['bodyId']: node['role'] for node in graph['nodes']}
        self.assertEqual(roles, {1: 'pn', 2: 'pn', 10: 'kc', 11: 'kc', 12: 'kc', 20: 'mbon', 30: 'dan_reward', 31: 'dan_punishment'})
        self.assertEqual(len(graph['edges']), len(EDGES))
        self.assertIn({'source': '12', 'target': '20', 'weight': 9}, graph['edges'])
        self.assertEqual(graph['metadata']['roleCounts']['kc'], 3)

    def test_kc_cap_ranks_by_pn_input_within_each_type(self):
        graph = extract(FakeClient(), make_args(max_kc=2), KEYS)
        kcs = sorted(node['bodyId'] for node in graph['nodes'] if node['role'] == 'kc')
        # Strongest fixKCa (10, input 5) and the only fixKCg (12); 11 (input 4) is dropped.
        self.assertEqual(kcs, [10, 12])

    def test_threshold_never_rounds_or_invents_edges(self):
        graph = extract(FakeClient(), make_args(min_weight=4), KEYS)
        self.assertTrue(all(edge['weight'] >= 4 for edge in graph['edges']))
        pairs = {(edge['source'], edge['target']) for edge in graph['edges']}
        self.assertNotIn(('11', '20'), pairs)
        self.assertNotIn(('31', '20'), pairs)
        self.assertIn(('2', '11'), pairs)

    def test_soma_side_schema_filters_on_soma_side(self):
        client = FakeClient()
        queries = []
        original = client.fetch_custom
        client.fetch_custom = lambda query: queries.append(query) or original(query)
        extract(client, make_args(), ['bodyId', 'type', 'somaSide'])
        self.assertTrue(all('n.`somaSide` = "R"' in query for query in queries if 'n.type IN' in query))

    def test_rejects_missing_labels_overlap_incomplete_circuit_and_drift(self):
        with self.assertRaises(CircuitError):
            extract(FakeClient(), make_args(mbon_type=['fixMBON', 'notAType']), KEYS)
        with self.assertRaises(CircuitError):
            extract(FakeClient(), make_args(dan_punishment_type=['fixPAM']), KEYS)
        no_punishment = {pair: w for pair, w in EDGES.items() if pair[0] != 31}
        with self.assertRaisesRegex(CircuitError, 'punishmentDAN'):
            extract(FakeClient(edges=no_punishment), make_args(), KEYS)
        with self.assertRaisesRegex(CircuitError, 'Verification'):
            extract(FakeClient(corrupt=True), make_args(), KEYS)
        with self.assertRaises(CircuitError):
            extract(FakeClient(), make_args(), ['bodyId', 'type'])


if __name__ == '__main__':
    unittest.main()
