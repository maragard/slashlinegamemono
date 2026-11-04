import unittest

from server import _player_hints, _player_info


class PlayerHintsTests(unittest.TestCase):
    def test_player_info_includes_unique_id_and_disambiguating_details(self):
        player = (
            "Bill Hallman",
            "MLA,CHW,PIT",
            "Outfielder",
            "1901",
            "1907",
            "1315",
            "0.235",
            "0.311",
            "0.303",
        )

        self.assertEqual(
            _player_info(1695, player),
            {
                "id": 1695,
                "name": "Bill Hallman",
                "team": "MLA,CHW,PIT",
                "position": "Outfielder",
                "debut_year": "1901",
                "retirement_year": "1907",
                "plate_apps": "1315",
                "avg": "0.235",
                "obp": "0.311",
                "slg": "0.303",
            },
        )

    def test_exact_years_and_full_position_and_team_matches(self):
        target = ("Target", "NYY, BOS", "Catcher and First Baseman", "1998", "2008")
        guess = ("Guess", "BOS,NYY", "First Baseman, Catcher", "1998", "2008")

        self.assertEqual(
            _player_hints(guess, target),
            {
                "debut_year": "correct",
                "retirement_year": "correct",
                "position": "correct",
                "team": "correct",
            },
        )

    def test_decade_and_partial_position_and_team_matches(self):
        target = ("Target", "NYY,BOS", "Catcher and First Baseman", "1998", "2008")
        guess = ("Guess", "BOS,CHW", "First Baseman and Shortstop", "1993", "2015")

        self.assertEqual(
            _player_hints(guess, target),
            {
                "debut_year": "decade",
                "retirement_year": None,
                "position": "partial",
                "team": "partial",
            },
        )
