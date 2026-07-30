from schema import JobType, Operation as Op

# ── Maler ─────────────────────────────────────────────────────────────
# Market bands: AT Innenanstrich 7-15 EUR/m2 all-in incl. Abdecken,
# Grundierung, 2x Anstrich and paint (fixbuddy.at, daibau.at). DE 7-20.
# Fassade AT 18-44.
#
# Time coefficients are the claim; the harness checks they land in band.
# Rolling a prepared wall is fast — a painter covers 25-40 m2/h with a roller.
# The time goes into masking, cutting in, and the second coat.

MALER = [
    JobType(
        key="maler.innenanstrich",
        trade="maler",
        label_de="Innenanstrich Wände, 2 Anstriche",
        unit="m2",
        setup_hours=(0.8, 1.5),
        typical_size=(25, 90),
        market_band_at=(7, 15), market_band_de=(7, 20),
        sources=["fixbuddy.at/was-kostet-maler", "daibau.at/baukostenrechner/maler"],
        note_keys=["moebel_bauseits"],
        operations=[
            Op("abdecken", "Abdecken und Abkleben", "m2", (0.030, 0.050)),
            Op("anstrich2", "Wandanstrich, zwei Anstriche", "m2", (0.055, 0.085)),
            Op("farbe", "Dispersionsfarbe", "m2", (0.0, 0.0), kind="material",
               material_per_unit=(1.10, 1.90), waste_factor=0.08),
        ],
    ),
    JobType(
        key="maler.decke",
        trade="maler", label_de="Deckenanstrich, 2 Anstriche", unit="m2",
        setup_hours=(0.6, 1.2), typical_size=(12, 40),
        market_band_at=(9, 18), market_band_de=(9, 22),
        sources=["daibau.at"],
        operations=[
            Op("abdecken", "Abdecken", "m2", (0.030, 0.050)),
            # Overhead work is slower than a wall and the reason ceilings
            # carry a surcharge in every price list.
            Op("anstrich2", "Deckenanstrich, zwei Anstriche", "m2", (0.070, 0.110)),
            Op("farbe", "Deckenfarbe", "m2", (0.0, 0.0), kind="material",
               material_per_unit=(1.10, 1.80), waste_factor=0.08),
        ],
    ),
    JobType(
        key="maler.spachteln_q3",
        trade="maler", label_de="Spachteln Q3 (glatt, streiffrei)", unit="m2",
        setup_hours=(0.8, 1.5), typical_size=(25, 90),
        market_band_at=(12, 25), market_band_de=(12, 28),
        sources=["profirechner.de/malerarbeiten-kosten-rechner"],
        note_keys=["untergrund_tragfaehig"],
        operations=[
            Op("grundierung", "Grundierung", "m2", (0.020, 0.035), kind="labor"),
            Op("spachtel_arbeit", "Flächenspachtelung Q3", "m2", (0.110, 0.180)),
            Op("schleifen", "Schleifen und entstauben", "m2", (0.035, 0.060)),
            Op("spachtel_mat", "Spachtelmasse und Grundierung", "m2", (0.0, 0.0),
               kind="material", material_per_unit=(1.40, 2.60), waste_factor=0.10),
        ],
    ),
    JobType(
        key="maler.tapete_entfernen",
        trade="maler", label_de="Tapete entfernen", unit="m2",
        setup_hours=(0.6, 1.2), typical_size=(20, 70),
        market_band_at=(5, 12), market_band_de=(5, 14),
        sources=["handwerksratgeber.de/maler-kosten"],
        note_keys=["altbau_untergrund"],
        operations=[
            # Raufaser peels; woodchip painted over five times does not.
            Op("loesen", "Tapete lösen und abziehen", "m2", (0.070, 0.160),
               debris_kg_per_unit=(0.4, 1.2)),
            Op("reste", "Kleisterreste waschen", "m2", (0.030, 0.060)),
        ],
    ),
    JobType(
        key="maler.fassade",
        trade="maler", label_de="Fassadenanstrich", unit="m2",
        setup_hours=(3.0, 6.0),      # Gerüst koordinieren, absichern
        typical_size=(80, 300),
        market_band_at=(18, 44), market_band_de=(20, 48),
        sources=["hausbau-magazin.at/malerkosten-oesterreich"],
        note_keys=["geruest_nicht_enthalten", "witterung"],
        operations=[
            Op("reinigen", "Fassade reinigen", "m2", (0.035, 0.070)),
            Op("grundierung", "Tiefengrund", "m2", (0.025, 0.045)),
            Op("anstrich2", "Fassadenanstrich, zwei Anstriche", "m2", (0.090, 0.150)),
            Op("fassadenfarbe", "Fassadenfarbe", "m2", (0.0, 0.0), kind="material",
               material_per_unit=(3.20, 6.50), waste_factor=0.10),
        ],
    ),
]
